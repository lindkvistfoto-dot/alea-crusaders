-- A linked instance may contain reserve snapshots, GM notes and an unredacted
-- end report. An existing SELECT grant cannot redact individual JSON fields.
create policy academy_instance_raw on public.combat_instances as restrictive for select to authenticated
using (settings->'academy_map' is distinct from 'true'::jsonb or private.is_admin() or private.is_campaign_gm(campaign_id));

-- Reuse the instance policy through its indexed primary key. The original
-- per-table permissions still decide access to legacy and manager rows.
do $$
declare relation text;
begin
  foreach relation in array array['combatants','combat_hexes','combat_actions','combat_log',
    'combat_battlefield_objects','combatant_effects','combat_area_effects','combat_area_events','combat_ammunition_spends']
  loop
    execute format('create policy academy_instance_children on public.%1$I as restrictive for select to authenticated
      using (exists (select from public.combat_instances ci where ci.id = %1$I.combat_id))', relation);
  end loop;
end $$;

-- The combat log is also mirrored to the journal. Keep the full original for
-- the GM, including after a reset deletes its source instance. Members read
-- linked battle events via the structured projection below.
create function private.protect_linked_journal_copy() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select from public.combat_instances ci where ci.id::text = new.details->>'combat_id'
             and ci.campaign_id = new.campaign_id and ci.settings->'academy_map' = 'true'::jsonb) then
    new.player_visible := false;
  end if;
  return new;
end $$;
revoke all on function private.protect_linked_journal_copy() from public, anon, authenticated;
create trigger academy_journal_copy before insert or update on public.campaign_journal_entries
for each row when (new.event_type = 'combat' and new.player_visible)
execute function private.protect_linked_journal_copy();

-- Never return an arbitrary result document or player-authored text in a combat card.
create function private.battle_result_scalars(document jsonb, numbers text[], flags text[])
returns jsonb language sql immutable set search_path = '' as $$
  select coalesce(jsonb_object_agg(k,v),'{}'::jsonb)
    from jsonb_each(case when jsonb_typeof(document)='object' then document else '{}'::jsonb end) as fields(k,v)
    where k=any(numbers) and jsonb_typeof(v)='number' or k=any(flags) and jsonb_typeof(v)='boolean'
$$;
revoke all on function private.battle_result_scalars(jsonb,text[],text[]) from public,anon,authenticated;

create function private.battle_visible_attack_result(result jsonb)
returns jsonb language sql immutable set search_path = '' as $$
  select private.battle_result_scalars(result,array['roll','fv','confirmation_roll'],
           array['success','full_damage','hit_resolved','awaiting_parry'])
    || jsonb_strip_nulls(jsonb_build_object(
      'outcome',case when result->>'outcome' in ('success','special','perfect','fail','fumble')
          and jsonb_typeof(result->'roll')='number' and jsonb_typeof(result->'fv')='number' then result->'outcome' end,
      'attack_mode',case when result->>'attack_mode' in ('melee','ranged') then result->'attack_mode' end,
      'hit_location',case when zones ? (hit->>'key') then jsonb_build_object(
        'key',hit->'key','label',zones->(hit->>'key'),
        'die',case when hit->>'die' in ('1T8','1T10') then hit->'die' end,
        'table',case when hit->>'table' in ('A','B') then hit->'table' end,
        'roll',case when jsonb_typeof(hit->'roll')='number' then hit->'roll' end) end,
      'damage',case when jsonb_typeof(dmg->'net_damage')='number' and jsonb_typeof(dmg->'kp_before')='number'
          and jsonb_typeof(dmg->'kp_after')='number' then private.battle_result_scalars(dmg,
          array['weapon_damage_value','damage_bonus_value','gross_damage','armor_absorption','effect_protection',
                'net_damage','kp_before','kp_after'],array['full_damage','armor_ignored','defeated']) end,
      'parry',case when parry->>'outcome' in ('success','special','perfect','fail','fumble')
          and jsonb_typeof(parry->'roll')='number' and jsonb_typeof(parry->'fv')='number'
          then private.battle_result_scalars(parry,array['roll','fv','confirmation_roll'],array['success'])
            || jsonb_build_object('outcome',parry->'outcome') end))
    from (select result->'hit_location' as hit,result->'damage' as dmg,result->'parry' as parry,
      '{"head":"Huvud","chest":"Bröstkorg","abdomen":"Mage","right_arm":"Höger arm","left_arm":"Vänster arm","right_leg":"Höger ben","left_leg":"Vänster ben"}'::jsonb as zones) fields
$$;
revoke all on function private.battle_visible_attack_result(jsonb) from public,anon,authenticated;

create function public.read_battle_player(p_campaign_id uuid, p_combat_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  battle public.combat_instances;
  people jsonb;
  visible uuid[];
  settings jsonb;
  actions jsonb;
  events jsonb;
  objects jsonb;
  effects jsonb;
  permission_revision bigint;
begin
  if (select auth.uid()) is null or not coalesce(private.is_campaign_member(p_campaign_id),false) then return null; end if;
  select ci.* into battle from public.combat_instances ci where ci.campaign_id=p_campaign_id
    and (p_combat_id is null or ci.id=p_combat_id)
    and (p_combat_id is not null or ci.status in ('setup','active','paused'))
    and (ci.settings->'academy_map' is distinct from 'true'::jsonb or
         (ci.status in ('active','paused','completed') and exists (select from public.campaign_maps m
          join private.combat_map_snapshots s on s.combat_id=ci.id and s.campaign_id=m.campaign_id and s.map_id=m.id
          where m.id=ci.map_id and m.campaign_id=p_campaign_id and m.player_visible
            and (m.image_path,m.width,m.height)=(s.image_path,s.width,s.height))))
    order by ci.updated_at desc,ci.id limit 1;
  if not found then return null; end if;
  if battle.settings->'academy_map' is distinct from 'true'::jsonb then
    -- The caller was checked against the legacy instance SELECT policy above.
    return jsonb_build_object('instance',to_jsonb(battle));
  end if;

  select coalesce(jsonb_object_agg(k,v),'{}') into settings from jsonb_each(battle.settings) s(k,v)
    where k=any(array['academy_map','pixels_per_meter','offset_x','offset_y','hex_m','background_width','background_height','map_lights_out'])
    and jsonb_typeof(v) in ('number','boolean');
  with initiative_order as (
    select value, min(ordinal) as original_rank from jsonb_array_elements_text(battle.initiative->'order')
      with ordinality as entries(value,ordinal) group by value
  ), explored as (
    select c.*,i.original_rank,
      row_number() over(order by i.original_rank nulls last,c.sort_order,c.name_snapshot,c.id) as display_rank,
      public.alea_footprint_shape(c.state,c.name_snapshot) as shape,
      coalesce((c.state->'footprint'->>'facing')::int,0) as facing
    from public.combatants c left join initiative_order i on i.value=c.id::text where c.campaign_id=p_campaign_id and c.combat_id=battle.id
      and private.battle_actor_explored(battle.map_id,p_campaign_id,battle.settings,c)
  )
  select coalesce(array_agg(id order by display_rank),'{}'),coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'combat_id',combat_id,'campaign_id',campaign_id,'name_snapshot',name_snapshot,'source_type',source_type,
    'source_id',source_id,'q',q,'r',r,'side',side,'visible_to_players',true,'status',status,'flying',flying,
    'current_kp',current_kp,'max_kp',max_kp,'current_psy',current_psy,'max_psy',max_psy,
    'movement_max',movement_max,'movement_remaining',movement_remaining,'sort_order',display_rank-1,
    'state',jsonb_strip_nulls(jsonb_build_object('footprint',jsonb_build_object('shape',shape,'facing',facing),
      'smi',case when jsonb_typeof(state->'smi')='number' then state->'smi' end,
      'initiative_rank',case when original_rank is not null then display_rank end,
      'initiative_roll',case when jsonb_typeof(state->'initiative_roll')='number' then state->'initiative_roll' end,
      'initiative_total',case when jsonb_typeof(state->'initiative_total')='number' then state->'initiative_total' end,
      'race_name',state->>'race_name','gender',state->>'gender','combat_icon_path',state->>'combat_icon_path',
      'portrait_image_path',state->>'portrait_image_path')))
    order by display_rank),'[]') into visible,people from explored;

  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'combatant_id',a.combatant_id,'status',a.status,
    'phase',a.phase,'slot_key',a.slot_key,'action_type',a.action_type,'target_combatant_id',a.target_combatant_id,
    'round_number',a.round_number,'sequence',array_position(visible,a.combatant_id)-1,'player_visible',true,
    'source_data',jsonb_strip_nulls(jsonb_build_object(
      'action_key',case when a.source_data->>'action_key' in ('attack','parry','spell_cast','move_full','other','weapon_switch')
        then a.source_data->'action_key' end,
      'mode',case when a.source_data->>'mode' in ('auto','melee','ranged','reaction','cast','full','other','equipment')
        then a.source_data->'mode' end)),
    'result',case when a.action_type='attack' and a.target_combatant_id=any(visible)
      then private.battle_visible_attack_result(a.result)
      else private.battle_result_scalars(a.result,'{}',array['success','hit_resolved']) end)
    order by a.round_number desc,a.sequence,a.created_at),'[]') into actions
    from public.combat_actions a where a.combat_id=battle.id and a.campaign_id=p_campaign_id and a.player_visible
      and a.round_number >= greatest(1,battle.round_number-1) and a.combatant_id=any(visible)
      and (a.target_combatant_id is null or a.target_combatant_id=any(visible));

  -- Do not forward raw log text or result documents. They can mention extra
  -- victims, concealed terrain and pre-action snapshots. The GM's explicit
  -- public announcement is the one free-text exception.
  with recent as (
    select l.*,c.name_snapshot as actor_name from public.combat_log l
      left join public.combatants c on c.id=l.actor_id and c.combat_id=l.combat_id
      where l.combat_id=battle.id and l.campaign_id=p_campaign_id and l.player_visible
      and (l.event_type='gm_event' and l.details @> '{"scope":"public","approved":true}' or
        l.actor_id=any(visible) and l.event_type in ('initiative','attack','damage','defeated','turn_end','parry',
          'fumble','antimagic','spell_attack','spell_after_antimagic','spell_effect','spell_heal','weapon_switch'))
      and (l.target_id is null or l.target_id=any(visible)) order by l.created_at desc,l.id desc limit 60
  ), projected as (
    select l.*,case l.event_type when 'initiative' then 'Initiativ' when 'attack' then 'Anfall'
      when 'damage' then 'Skada' when 'defeated' then 'Utslagen' when 'turn_end' then 'Avslutar turen'
      when 'parry' then 'Parering' when 'fumble' then 'Fummel' when 'antimagic' then 'Antimagi'
      when 'weapon_switch' then 'Byter vapen' else 'Magi' end as label,
      (select jsonb_agg(jsonb_build_object('target_id',v->>'target_id','damage',true))
       from jsonb_array_elements(case when jsonb_typeof(l.details->'target_results')='array'
         then l.details->'target_results' else '[]' end) t(v)
       where v->>'target_id'=any(visible::text[]) and jsonb_typeof(v->'damage')='object'
         and v->'blocked_by_beskyddare' is distinct from 'true'::jsonb) as hits
    from recent l
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'event_type',event_type,'actor_id',actor_id,
    'target_id',target_id,'round_number',round_number,'phase',phase,'created_at',created_at,'player_visible',true,
    'message',case when event_type='gm_event' then message else actor_name || ' · ' || label end,
    'details',case when event_type in ('spell_attack','spell_after_antimagic') and hits is not null
      and details @> '{"success":true,"hit_resolved":true}' and details->'awaiting_antimagic' is distinct from 'true'::jsonb
      then jsonb_build_object('success',true,'hit_resolved',true,'target_results',hits) else '{}'::jsonb end)
    order by created_at desc,id desc),'[]') into events from projected;

  -- The current Battlefield Library admits single-hex pieces. A new multihex
  -- catalogue will need its occupied cells checked before it can be exposed.
  select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'object_key',o.object_key,'asset_key',o.asset_key,
    'name_snapshot',o.name_snapshot,'q',o.q,'r',o.r,'rotation',o.rotation,'footprint',o.footprint,
    'damage',o.damage,'max_damage',o.max_damage,'visible_to_players',true)
    order by o.r,o.q),'[]') into objects from public.combat_battlefield_objects o
    where o.campaign_id=p_campaign_id and o.combat_id=battle.id and o.visible_to_players
      and o.footprint='[{"q":0,"r":0}]'::jsonb and private.is_campaign_map_object_discovered(
        battle.map_id,p_campaign_id,private.battle_map_center(battle.settings,o.q,o.r));

  select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'combatant_id',e.combatant_id,
    'effect_id',e.effect_id,'source_combatant_id',e.source_combatant_id,'strength',e.strength,
    'applied_round',e.applied_round,'expires_round',e.expires_round,'expires_at',e.expires_at,
    'status',e.status,'parameters','{}'::jsonb) order by e.created_at,e.id),'[]') into effects
    from public.combatant_effects e where e.campaign_id=p_campaign_id and e.combat_id=battle.id
      and e.status='active' and e.combatant_id=any(visible)
      and (e.source_combatant_id is null or e.source_combatant_id=any(visible));

  select revision into permission_revision from public.campaign_map_signals where campaign_id=p_campaign_id;
  return jsonb_build_object('instance',jsonb_build_object('id',battle.id,'map_id',battle.map_id,'campaign_id',p_campaign_id,
    'name',battle.name,'status',battle.status,'phase',battle.phase,'round_number',battle.round_number,'updated_at',battle.updated_at,
    'settings',settings,'active_actor_id',case when battle.active_actor_id=any(visible) then battle.active_actor_id end,
    'active_responder_id',case when battle.active_responder_id=any(visible) then battle.active_responder_id end,
    'initiative',jsonb_build_object('formula','SMI+1T10','order',coalesce((select jsonb_agg(v order by n)
      from jsonb_array_elements_text(coalesce(battle.initiative->'order','[]')) with ordinality t(v,n)
      where v=any(visible::text[])),'[]'))),'combatants',people,'actions',actions,'events',events,
    'objects',objects,'effects',effects,'map_revision',permission_revision);
end $$;

revoke all on function public.read_battle_player(uuid,uuid) from public,anon;
grant execute on function public.read_battle_player(uuid,uuid) to authenticated;
