-- Keep the original campaign-wide "latest combat" lookup on its own fights.
-- This restrictive policy only narrows SELECT. Existing membership/GM policies
-- still apply, including on requests that specify the adventure client header.
create policy adventure_combat_namespace on public.combat_instances
as restrictive for select to authenticated using (
  settings->>'origin' is distinct from 'adventure'
  or coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-client-info'='alea-adventure-combat'
);

create unique index adventure_encounter_active_map on public.combat_instances(session_id,map_id)
where settings->>'origin'='adventure' and status in ('active','paused','setup');

create function public.start_adventure_encounter(p_map uuid,p_session uuid,p_scene uuid,p_actors jsonb,p_initiative jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare
  m public.campaign_maps; f public.adventure_map_figures; a jsonb;
  fight uuid; active_id uuid; ppm float8; n integer; sc public.campaign_combat_scene_combatants;
begin
  select * into strict m from public.campaign_maps where id=p_map;
  if (private.is_campaign_gm(m.campaign_id) or private.is_admin()) is not true then
    raise exception 'Endast SL kan starta striden.' using errcode='42501';
  end if;
  perform 1 from public.game_sessions where id=p_session and campaign_id=m.campaign_id and status='active' for share;
  if not found then raise exception 'Spelmötet är inte aktivt.'; end if;
  perform 1 from public.campaign_map_settings where campaign_id=m.campaign_id and active_map_id=p_map for share;
  if not found then raise exception 'Välj kartan som aktuell karta före start.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_session::text||p_map::text,0));
  select id into fight from public.combat_instances where session_id=p_session and map_id=p_map
    and settings->>'origin'='adventure' and status in ('active','paused','setup');
  if found then return fight; end if;
  select count(*) into n from public.adventure_map_figures where map_id=p_map and session_id=p_session;
  if p_scene is not null then
    perform 1 from public.campaign_combat_scenes where id=p_scene and campaign_id=m.campaign_id for share;
    if not found then raise exception 'Stridsscenen tillhör inte kampanjen.'; end if;
  end if;
  if n=0 and p_scene is not null then
    for a in select value from jsonb_array_elements(p_actors) loop
      select * into strict sc from public.campaign_combat_scene_combatants
        where id=(a->>'scene_actor_id')::uuid and scene_id=p_scene and campaign_id=m.campaign_id;
      if sc.start_q is null or sc.start_r is null then raise exception 'Startposition saknas.'; end if;
      insert into public.adventure_map_figures(id,campaign_id,session_id,map_id,q,r,name,player_visible,
        character_id,npc_character_id,npc_id,monster_id)
      values((a->>'figure_id')::uuid,m.campaign_id,p_session,p_map,sc.start_q,sc.start_r,sc.name,sc.visible_to_players,
        case when sc.source_type='character' and exists(select from public.characters where id=sc.source_id and not is_npc) then sc.source_id end,
        case when sc.source_type='character' and exists(select from public.characters where id=sc.source_id and is_npc) then sc.source_id end,
        case when sc.source_type='npc' then sc.source_id end,case when sc.source_type='monster' then sc.source_id end)
      on conflict (session_id,character_id) do update set map_id=p_map,q=excluded.q,r=excluded.r
      returning * into f;
      -- Existing campaign characters retain their figure UUID on a map change.
      p_actors=(select jsonb_agg(case when elem->>'id'=a->>'id' then elem||jsonb_build_object('figure_id',f.id) else elem end)
        from jsonb_array_elements(p_actors) elem);
    end loop;
    select count(*) into n from public.adventure_map_figures where map_id=p_map and session_id=p_session;
  end if;
  if n=0 or jsonb_array_length(p_actors) is distinct from n
     or (select count(distinct v->>'figure_id') from jsonb_array_elements(p_actors) v)<>n then
    raise exception 'Deltagarna på kartan har ändrats. Läs om före start.';
  end if;
  select (configuration->>'pixelsPerMeter')::float8 into ppm from public.campaign_map_academy where map_id=p_map;
  ppm=coalesce(ppm,(to_jsonb(m)->>'pixels_per_meter')::float8,m.height/45.0);
  if ppm<=0 then raise exception 'Ogiltig kartkalibrering.'; end if;
  fight=gen_random_uuid();
  insert into public.combat_instances(id,campaign_id,session_id,map_id,name,status,round_number,phase,initiative,settings,started_by,started_at)
  values(fight,m.campaign_id,p_session,p_map,m.name,'active',1,'movement',p_initiative,
    jsonb_build_object('origin','adventure','adventure_scene',p_scene,'rows',m.height/(1.5*ppm),'hex_scale',1),auth.uid(),now());
  for a in select value from jsonb_array_elements(p_actors) loop
    select * into strict f from public.adventure_map_figures where id=(a->>'figure_id')::uuid
      and map_id=p_map and session_id=p_session for update;
    if (f.q,f.r) is distinct from ((a->>'q')::int,(a->>'r')::int)
       or coalesce(f.character_id,f.npc_character_id,f.npc_id,f.monster_id) is distinct from (a->>'source_id')::uuid then
      raise exception 'En figur har ändrats. Läs om före start.';
    end if;
    insert into public.combatants(id,combat_id,campaign_id,source_type,source_id,source_instance_key,
      name_snapshot,side,controller_user_id,q,r,flying,visible_to_players,current_kp,max_kp,current_psy,max_psy,
      movement_max,movement_remaining,status,state,sort_order)
    values((a->>'id')::uuid,fight,m.campaign_id,case when f.monster_id is not null then 'monster'
      when f.npc_id is not null then 'npc' else 'character' end,(a->>'source_id')::uuid,f.id::text,
      f.name,a->>'side',(a->>'controller_user_id')::uuid,f.q,f.r,(a->>'flying')::boolean,f.player_visible,
      (a->>'current_kp')::int,(a->>'max_kp')::int,(a->>'current_psy')::int,(a->>'max_psy')::int,
      (a->>'movement_max')::numeric,(a->>'movement_max')::numeric,'active',a->'state',(a->>'sort_order')::int);
  end loop;
  if p_scene is not null then
    insert into public.combat_hexes(combat_id,campaign_id,q,r,movement_mode,sight_mode,movement_cost,notes)
    select fight,m.campaign_id,h.q,h.r,h.movement_mode,h.sight_mode,h.movement_cost,h.notes
      from public.campaign_combat_scene_hexes h where h.scene_id=p_scene;
  end if;
  select id into strict active_id from public.combatants where combat_id=fight and id=(p_initiative->'order'->>0)::uuid;
  update public.combat_instances set active_actor_id=active_id where id=fight;
  return fight;
end $$;
revoke all on function public.start_adventure_encounter(uuid,uuid,uuid,jsonb,jsonb) from public,anon;
grant execute on function public.start_adventure_encounter(uuid,uuid,uuid,jsonb,jsonb) to authenticated;

-- Movement, knockback and undo move the same figure in the same transaction.
create function private.follow_adventure_combatant() returns trigger
language plpgsql security definer set search_path='' as $$
declare instance public.combat_instances; f public.adventure_map_figures; m public.campaign_maps;
begin
  select * into instance from public.combat_instances where id=new.combat_id and settings->>'origin'='adventure';
  if not found or new.q is null or new.r is null then return new; end if;
  if new.source_instance_key is null or new.source_instance_key !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then return new; end if;
  select * into strict f from public.adventure_map_figures where id=new.source_instance_key::uuid
    and map_id=instance.map_id and session_id=instance.session_id for update;
  select * into strict m from public.campaign_maps where id=instance.map_id;
  if current_setting('alea.adventure_path_actor',true) is distinct from new.id::text then
    perform private.adventure_check_path(m,f,jsonb_build_array(jsonb_build_array(new.q,new.r)));
  end if;
  perform set_config('alea.hex_move_object',f.id::text,true);
  update public.adventure_map_figures set q=new.q,r=new.r where id=f.id;
  perform set_config('alea.hex_move_object','',true);
  return new;
end $$;
revoke all on function private.follow_adventure_combatant() from public,anon,authenticated;
create trigger follow_adventure_combatant after update of q,r on public.combatants for each row
when ((old.q,old.r) is distinct from (new.q,new.r)) execute function private.follow_adventure_combatant();

-- Check every traversed adventure hex before delegating cost, occupancy and
-- combat effects to the same movement RPC used by the reference screen.
create function public.move_adventure_combatant(p_combatant_id uuid,p_from_q integer,p_from_r integer,
  p_expected_remaining numeric,p_path jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.combatants; i public.combat_instances; f public.adventure_map_figures;
  m public.campaign_maps; route jsonb; result jsonb;
begin
  select * into strict c from public.combatants where id=p_combatant_id for update;
  select * into strict i from public.combat_instances where id=c.combat_id and settings->>'origin'='adventure' and status='active';
  if (private.is_campaign_gm(i.campaign_id) or private.is_admin()) is not true then
    raise exception 'Endast SL kan flytta en kombattant.' using errcode='42501';
  end if;
  select * into strict f from public.adventure_map_figures where id=c.source_instance_key::uuid
    and map_id=i.map_id and session_id=i.session_id for update;
  if (f.q,f.r) is distinct from (p_from_q,p_from_r) then raise exception 'Figuren har flyttats.'; end if;
  select * into strict m from public.campaign_maps where id=i.map_id;
  select jsonb_agg(jsonb_build_array(h->'q',h->'r') order by step) into route
    from jsonb_array_elements(p_path) with ordinality cells(h,step);
  perform private.adventure_check_path(m,f,route);
  perform set_config('alea.adventure_path_actor',c.id::text,true);
  result=public.alea_move_multhex(c.id,p_from_q,p_from_r,p_expected_remaining,p_path);
  perform set_config('alea.adventure_path_actor','',true);
  return result;
end $$;
revoke all on function public.move_adventure_combatant(uuid,integer,integer,numeric,jsonb) from public,anon;
grant execute on function public.move_adventure_combatant(uuid,integer,integer,numeric,jsonb) to authenticated;

-- Reset the tactical overlay and notify both roles through the map's existing
-- realtime signal on entry and exit, even when no figure changed position.
create function private.adventure_combat_mode_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.settings->>'origin'='adventure' and (tg_op='INSERT' or new.status='completed' and old.status is distinct from new.status) then
    insert into public.adventure_hex_state(campaign_id,map_id,session_id) values(new.campaign_id,new.map_id,new.session_id)
      on conflict (session_id,map_id) do nothing;
    update public.adventure_hex_state set round_no=0,paused_round=0,spent='{}',epoch=epoch+1
      where map_id=new.map_id and session_id=new.session_id;
  end if;
  return new;
end $$;
revoke all on function private.adventure_combat_mode_change() from public,anon,authenticated;
create trigger adventure_combat_mode_change after insert or update of status on public.combat_instances
for each row execute function private.adventure_combat_mode_change();
