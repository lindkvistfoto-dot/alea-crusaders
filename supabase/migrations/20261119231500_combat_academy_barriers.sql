-- Only combat instances own this projection. Neither the original vector walls
-- nor the painted mask belongs in the member-readable instance settings.
alter table public.combat_hexes add column academy_barriers jsonb;
create policy combat_hexes_academy_projection on public.combat_hexes
  as restrictive for select to authenticated
  using (academy_barriers is null or (select private.is_admin()) or private.is_campaign_gm(campaign_id));

create function private.academy_edge_bit(dq integer, dr integer)
returns integer language sql immutable strict set search_path='' as $$
  select case
    when dq=1 and dr=0 then 1 when dq=0 and dr=1 then 2 when dq=-1 and dr=1 then 4
    when dq=-1 and dr=0 then 8 when dq=0 and dr=-1 then 16 when dq=1 and dr=-1 then 32
    else 0 end
$$;

-- haj_move_combatant updates the actor one adjacent step at a time. Checking at
-- that write also covers initial placement, reinforcements and footprint rotation.
create function private.check_academy_footprint()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  cfg jsonb;
  current_round integer;
  ignore_ground boolean;
  pitch float8;
  w float8;
  h float8;
  dq integer := 0;
  dr integer := 0;
  shape text;
  facing integer;
  invalid boolean;
begin
  if new.status='removed' then return new; end if;
  select settings,round_number into cfg,current_round from public.combat_instances where id=new.combat_id;
  if cfg->'academy_map' is distinct from 'true'::jsonb then return new; end if;
  if tg_op='UPDATE' and old.status<>'removed' and (new.q,new.r)=(old.q,old.r)
      and new.state->'footprint' is not distinct from old.state->'footprint'
      and new.name_snapshot is not distinct from old.name_snapshot then return new; end if;
  pitch:=(cfg->>'pixels_per_meter')::float8 * coalesce((cfg->>'hex_m')::float8,1.5);
  w:=(cfg->>'background_width')::float8;
  h:=(cfg->>'background_height')::float8;
  if not coalesce(pitch>0 and w>0 and h>0,false) then raise exception 'Stridskartans måttskala saknas.'; end if;
  -- A costed path step traverses an edge. SL relocating a piece is a new
  -- placement, including when the two placements happen to be neighbours.
  if tg_op='UPDATE' and old.status<>'removed' and new.movement_remaining<old.movement_remaining then
    dq:=new.q-old.q; dr:=new.r-old.r;
  end if;
  -- Same active flight modifier, round window and wall-clock window as
  -- haj_move_combatant. An airborne piece with ignore_terrain=false stays blocked.
  ignore_ground:=new.flying or exists(
    select 1 from public.combatant_effects e join public.rule_effects d on d.id=e.effect_id
    where e.combat_id=new.combat_id and e.combatant_id=new.id and e.status='active'
      and e.applied_round<=current_round and (e.expires_round is null or e.expires_round>=current_round)
      and (e.expires_at is null or e.expires_at>now()) and d.active
      and d.modifiers->>'type'='flight' and d.modifiers->>'ignore_terrain'='true');
  shape:=public.alea_footprint_shape(new.state,new.name_snapshot);
  facing:=coalesce((new.state->'footprint'->>'facing')::integer,0);
  with footprint as (
    select * from public.alea_footprint_cells(new.q,new.r,shape,facing)
  ), destination as (
    select f.q,f.r,
      (t.academy_barriers->>case when ignore_ground then 'solid_wall' else 'solid_move' end)::boolean as solid,
      (t.academy_barriers->>case when ignore_ground then 'wall' else 'move' end)::integer as edges,
      private.battle_map_center(cfg,f.q,f.r) as center
    from footprint f left join public.combat_hexes t on t.combat_id=new.combat_id and t.q=f.q and t.r=f.r
  )
  select exists (
    select 1 from destination d
    where d.center[0]<0 or d.center[1]<0 or d.center[0]>=w or d.center[1]>=h or d.solid
      -- Movement passes into this cell from the opposite side.
      or (d.edges & private.academy_edge_bit(-dq,-dr))<>0
      -- A large creature cannot straddle a wall running between two occupied centres.
      or exists (select 1 from footprint f
        where (d.edges & private.academy_edge_bit(f.q-d.q,f.r-d.r))<>0)
  ) into invalid;
  if invalid then raise exception 'Kartans hinder eller kant stoppar kombatantens hexavtryck.'; end if;
  return new;
end
$$;

revoke all on function private.check_academy_footprint(), private.academy_edge_bit(integer,integer)
  from public, anon, authenticated;
create trigger check_academy_footprint before insert or update of q,r,state,status,name_snapshot on public.combatants
  for each row execute function private.check_academy_footprint();
