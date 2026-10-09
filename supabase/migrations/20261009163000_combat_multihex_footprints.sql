-- Alea Crusaders v0.35.20: authoritative multihex collision and rotation.
-- Shapes and facing live in combatants.state.footprint (legacy single-hex remains supported).
create or replace function public.alea_footprint_cells(
 p_q integer,p_r integer,p_shape text,p_facing integer default 0
) returns table(q integer,r integer)
language plpgsql immutable set search_path='' as $function$
declare v_dx integer;v_dr integer;v_next integer;v_turn integer;v_dir integer;
begin
 if p_shape not in ('single','line2','triangle3','line3','giant7') then
  raise exception 'Unknown footprint shape';
 end if;
 v_dir:=mod(mod(coalesce(p_facing,0),6)+6,6);
 for v_dx,v_dr in
  select offsets.dx,offsets.dr from (
   values (0,0, 'single'),(0,0,'line2'),(1,0,'line2'),
    (0,0,'triangle3'),(1,0,'triangle3'),(0,1,'triangle3'),
    (0,0,'line3'),(1,0,'line3'),(2,0,'line3'),
    (0,0,'giant7'),(1,0,'giant7'),(0,1,'giant7'),
    (-1,1,'giant7'),(-1,0,'giant7'),(0,-1,'giant7'),(1,-1,'giant7')
  ) as offsets(dx,dr,shape)
  where offsets.shape=p_shape
 loop
  for v_turn in 1..v_dir loop
   v_next:=-v_dr;v_dr:=v_dx+v_dr;v_dx:=v_next;
  end loop;
  q:=p_q+v_dx;r:=p_r+v_dr;return next;
 end loop;
end $function$;

create or replace function public.alea_footprint_shape(p_state jsonb,p_name text)
 returns text language sql immutable set search_path='' as $function$
 select case
 when p_state->'footprint'->>'shape' in ('single','line2','triangle3','line3','giant7')
  then p_state->'footprint'->>'shape'
 when coalesce(p_name,'') ~* 'rese' then 'triangle3'
 when coalesce(p_name,'') ~* 'krokodil' then 'line3'
 when coalesce(p_name,'') ~* 'häst|horse|åsna|donkey|lejon|tiger' then 'line2'
 else 'single' end
$function$;

create or replace function public.alea_move_multhex(
 p_combatant_id uuid,p_from_q integer,p_from_r integer,p_expected_remaining numeric,p_path jsonb
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor record;v_cell record;v_step jsonb;
 v_shape text;v_facing integer;v_q integer;v_r integer;
 v_prior_q integer;v_prior_r integer;v_flying boolean;v_res jsonb;
begin
 select c.*,i.active_actor_id,i.phase,i.status as battle_status
 into v_actor from public.combatants c
 join public.combat_instances i on i.id=c.combat_id
 where c.id=p_combatant_id for update of c;
 if not found then raise exception 'Combatant not found';end if;
 if not (private.is_admin() or private.is_campaign_gm(v_actor.campaign_id)) then
  raise exception 'Only the GM may move a combatant';
 end if;
 if v_actor.battle_status<>'active' or v_actor.phase<>'movement'
 or v_actor.active_actor_id is distinct from p_combatant_id
 or v_actor.status in ('dead','removed','defeated')
 or v_actor.q is distinct from p_from_q or v_actor.r is distinct from p_from_r
 or v_actor.movement_remaining is distinct from p_expected_remaining then
  raise exception 'Outdated movement or inactive combatant';
 end if;
 if p_path is null or jsonb_typeof(p_path)<>'array'
 or jsonb_array_length(p_path) not between 1 and 160 then
  raise exception 'Invalid movement path';
 end if;
 v_shape:=public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot);
 v_facing:=coalesce((v_actor.state->'footprint'->>'facing')::integer,0);
 v_flying:=coalesce(v_actor.flying,false) or exists(
  select 1 from public.combatant_effects e join public.rule_effects d on d.id=e.effect_id
  where e.combat_id=v_actor.combat_id and e.combatant_id=p_combatant_id
  and e.status='active' and d.active and d.modifiers->>'type'='flight'
  and d.modifiers->>'ignore_terrain'='true');
 v_prior_q:=v_actor.q;v_prior_r:=v_actor.r;
 for v_step in select value from jsonb_array_elements(p_path) loop
  if jsonb_typeof(v_step)<>'object' or coalesce(v_step->>'q','') !~ '^[-]?[0-9]{1,6}$'
   or coalesce(v_step->>'r','') !~ '^[-]?[0-9]{1,6}$' then
    raise exception 'Invalid hex step';
  end if;
  v_q:=(v_step->>'q')::integer;v_r:=(v_step->>'r')::integer;
  if (abs(v_q-v_prior_q)+abs(v_r-v_prior_r)+abs(v_q-v_prior_q+v_r-v_prior_r))<>2 then
   raise exception 'Nonadjacent movement path';
  end if;
  for v_cell in select * from public.alea_footprint_cells(v_q,v_r,v_shape,v_facing) loop
   if exists(
    select 1 from public.combat_hexes h where h.combat_id=v_actor.combat_id
    and h.q=v_cell.q and h.r=v_cell.r
    and (coalesce(h.notes,'') ~* '(^|[[:space:],;|])(wall|vägg|mur)($|[[:space:],;|])'
      or (h.movement_mode='blocked' and not v_flying))
   ) then raise exception 'Footprint intersects wall or blocked terrain'; end if;
   if exists(
    select 1 from public.combatants other
     cross join lateral public.alea_footprint_cells(
      other.q,other.r,public.alea_footprint_shape(other.state,other.name_snapshot),
      coalesce((other.state->'footprint'->>'facing')::integer,0)) pos
    where other.combat_id=v_actor.combat_id and other.id<>p_combatant_id
     and other.status<>'removed' and pos.q=v_cell.q and pos.r=v_cell.r
   ) then raise exception 'Footprint intersects another combatant';end if;
  end loop;
  v_prior_q:=v_q;v_prior_r:=v_r;
 end loop;
 -- Preserve the existing authoritative movement cost, effects and interruption logic.
 v_res:=public.haj_move_combatant(p_combatant_id,p_from_q,p_from_r,p_expected_remaining,p_path);
 return v_res;
end $function$;

create or replace function public.alea_rotate_multhex(
 p_combatant_id uuid,p_facing integer
) returns jsonb language plpgsql security definer set search_path='' as $function$
declare v_actor record;v_cell record;v_shape text;v_facing integer;
begin
 select c.*,i.status as battle_status into v_actor
 from public.combatants c join public.combat_instances i on i.id=c.combat_id
 where c.id=p_combatant_id for update of c;
 if not found then raise exception 'Combatant not found';end if;
 if not(private.is_admin() or private.is_campaign_gm(v_actor.campaign_id)) then
  raise exception 'Only the GM may rotate a combatant';
 end if;
 if v_actor.battle_status not in ('setup','active','paused') or v_actor.status in ('dead','removed','defeated')
  then raise exception 'Combatant cannot rotate now';end if;
 if p_facing not between 0 and 5 then raise exception 'Invalid facing';end if;
 v_shape:=public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot);
 for v_cell in select * from public.alea_footprint_cells(v_actor.q,v_actor.r,v_shape,p_facing) loop
  if exists(
   select 1 from public.combat_hexes h where h.combat_id=v_actor.combat_id
    and h.q=v_cell.q and h.r=v_cell.r and
    (h.movement_mode='blocked' or coalesce(h.notes,'') ~* '(^|[[:space:],;|])(wall|vägg|mur)($|[[:space:],;|])')
  ) then raise exception 'Rotation crosses blocked terrain';end if;
  if exists(
   select 1 from public.combatants other cross join lateral public.alea_footprint_cells(
    other.q,other.r,public.alea_footprint_shape(other.state,other.name_snapshot),
    coalesce((other.state->'footprint'->>'facing')::integer,0)) pos
   where other.combat_id=v_actor.combat_id and other.id<>p_combatant_id
    and other.status<>'removed' and pos.q=v_cell.q and pos.r=v_cell.r
  ) then raise exception 'Rotation intersects another combatant';end if;
 end loop;
 update public.combatants set state=jsonb_set(
  coalesce(v_actor.state,'{}'::jsonb),'{footprint}',
  jsonb_build_object('shape',v_shape,'facing',p_facing),true),updated_at=now()
 where id=p_combatant_id;
 return jsonb_build_object('id',p_combatant_id,'facing',p_facing,'shape',v_shape);
end $function$;

revoke all on function public.alea_move_multhex(uuid,integer,integer,numeric,jsonb) from public;
revoke all on function public.alea_rotate_multhex(uuid,integer) from public;
grant execute on function public.alea_move_multhex(uuid,integer,integer,numeric,jsonb) to authenticated;
grant execute on function public.alea_rotate_multhex(uuid,integer) to authenticated;
