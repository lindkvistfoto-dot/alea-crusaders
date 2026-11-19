-- The campaign map and linked battles share the same discovery/clipping path.
-- Do not grant clients direct access to the privileged source projection.
create function private.battle_map_center(p_settings jsonb, p_q integer, p_r integer)
returns point language sql immutable strict set search_path = ''
as $$
  select point(coalesce((p_settings->>'offset_x')::float8,0) + pitch * (p_q + p_r / 2.0),
               coalesce((p_settings->>'offset_y')::float8,0) + pitch * sqrt(3.0::float8) / 2 * p_r)
  from (select (p_settings->>'pixels_per_meter')::float8 * coalesce((p_settings->>'hex_m')::float8,1.5) as pitch) s
$$;
revoke all on function private.battle_map_center(jsonb,integer,integer) from public, anon, authenticated;

create function private.battle_actor_explored(p_map_id uuid, p_campaign_id uuid, p_settings jsonb, p_actor public.combatants)
returns boolean language sql stable set search_path = ''
as $$
  select coalesce((p_actor).campaign_id = p_campaign_id and (p_actor).visible_to_players
    and (p_actor).status <> 'removed' and not coalesce((p_actor).state->'in_reserve' = 'true'::jsonb, false)
    and (p_settings->>'pixels_per_meter')::float8 > 0 and (
      select bool_and(private.is_campaign_map_object_discovered(
        p_map_id,p_campaign_id,private.battle_map_center(p_settings,cell.q,cell.r)))
      from public.alea_footprint_cells((p_actor).q,(p_actor).r,
        public.alea_footprint_shape((p_actor).state,(p_actor).name_snapshot),
        coalesce(((p_actor).state->'footprint'->>'facing')::int,0)) cell
    ), false)
$$;
revoke all on function private.battle_actor_explored(uuid,uuid,jsonb,public.combatants) from public, anon, authenticated;

create function private.project_map_academy(p_map_id uuid, p_combat_id uuid, p_known_mask_revision text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  map_row record;
  config jsonb;
  encounter_settings jsonb;
  mask jsonb;
  mw integer;
  mh integer;
  dx double precision;
  dy double precision;
  rooms polygon[];
  concealed polygon[];
  blockers polygon[];
  edges lseg[];
  clipped jsonb := null;
  mask_revision text;
  reuse_mask boolean := false;
  has_visible_mask boolean := false;
  lights jsonb;
begin
  select m.campaign_id, m.width, m.height, case when p_combat_id is null then a.configuration else snap.configuration end as configuration
    into map_row
    from public.campaign_maps m
    left join public.campaign_map_academy a on p_combat_id is null and a.map_id = m.id and a.campaign_id = m.campaign_id
    left join private.combat_map_snapshots snap on p_combat_id is not null and snap.combat_id = p_combat_id
      and snap.map_id = m.id and snap.campaign_id = m.campaign_id and snap.image_path = m.image_path
      and snap.width = m.width and snap.height = m.height
    where (case when p_combat_id is null then a.configuration else snap.configuration end) is not null
      and m.id = p_map_id and m.player_visible and private.is_campaign_member(m.campaign_id)
      and (select auth.uid()) is not null;
  if not found then return null; end if;
  if p_combat_id is not null then
    select ci.settings into encounter_settings from public.combat_instances ci
      where ci.id = p_combat_id and ci.map_id = p_map_id
      and ci.campaign_id = map_row.campaign_id and ci.settings->'academy_map' = 'true'::jsonb;
    if not found then return null; end if;
    -- Map areas, discovery and map visibility advance this existing revision.
    -- Snapshot geometry is immutable. Always re-evaluate authorization, rooms
    -- and current actor locations, including when the raster is unchanged.
    select s.revision::text into mask_revision from public.campaign_map_signals s
      where s.campaign_id = map_row.campaign_id;
    reuse_mask := coalesce(mask_revision = p_known_mask_revision,false);
  end if;
  config := map_row.configuration;
  mask := config->'freeSight';

  with room_shapes as (
    select coalesce(s.status, 'unknown') status,
      case when a.shape_type = 'rect' then polygon(box(
        point((a.shape_data->>'x')::float8, (a.shape_data->>'y')::float8),
        point((a.shape_data->>'x')::float8 + (a.shape_data->>'width')::float8,
              (a.shape_data->>'y')::float8 + (a.shape_data->>'height')::float8)))
      when jsonb_array_length(a.shape_data->'points') >= 3 then
        (select ('(' || string_agg(format('(%s,%s)', (v->>0)::float8, (v->>1)::float8), ',' order by n) || ')')::polygon
          from jsonb_array_elements(a.shape_data->'points') with ordinality p(v,n))
      end as shape
    from public.campaign_map_areas a
    left join public.campaign_location_state s on s.location_id = a.location_id and s.campaign_id = a.campaign_id
    where a.map_id = p_map_id and a.campaign_id = map_row.campaign_id
  )
  select array_agg(shape) filter (where status = 'explored' and shape is not null),
         array_agg(shape) filter (where status <> 'explored' and shape is not null)
    into rooms, concealed from room_shapes;
  concealed := coalesce(concealed, array[]::polygon[]);

  if jsonb_typeof(mask) = 'object' and rooms is not null then
    mw := (mask->>'width')::integer;
    mh := (mask->>'height')::integer;
    has_visible_mask := mw between 1 and 1536 and mh between 1 and 1536;
    if has_visible_mask and not reuse_mask then
      dx := map_row.width::float8 / mw;
      dy := map_row.height::float8 / mh;
      with shapes as (
        select item, array_agg(point((v->>0)::float8, (v->>1)::float8) order by n) as pts,
          string_agg(format('(%s,%s)', (v->>0)::float8, (v->>1)::float8), ',' order by n) as coords
        from jsonb_array_elements(config->'geometry') with ordinality g(item, i)
        cross join lateral jsonb_array_elements(item->'points') with ordinality p(v,n)
        where item->'light' = 'true'::jsonb
        group by i,item
      )
      select array_agg(('(' || coords || ')')::polygon) filter (where item->'closed' = 'true'::jsonb and cardinality(pts) >= 3)
        into blockers from shapes;
      select array_agg(lseg(point((v->>0)::float8,(v->>1)::float8), point((w->>0)::float8,(w->>1)::float8)))
        into edges
        from jsonb_array_elements(config->'geometry') g(item)
        cross join lateral jsonb_array_elements(item->'points') with ordinality p(v,n)
        cross join lateral (select item->'points'->(n::int % jsonb_array_length(item->'points')) as w) next
        where item->'light' = 'true'::jsonb and (item->'closed' = 'true'::jsonb or n < jsonb_array_length(item->'points'));
      with candidates as (
        select i, point((i % mw + .5) * dx, (i / mw + .5) * dy) as p
        from jsonb_array_elements(mask->'runs') r(v)
        cross join lateral generate_series(greatest(0,(v->>0)::int),
          least(mw * mh - 1, (v->>0)::int + (v->>1)::int - 1)) as i
      ), visible as (
        select distinct i from candidates c
        where exists (select 1 from unnest(rooms) room where room @> c.p)
          and not exists (select 1 from unnest(concealed) room where room @> c.p)
          and not exists (select 1 from unnest(blockers) b where b @> c.p)
          and not exists (select 1 from unnest(edges) e where e <-> c.p <= .5 * sqrt(dx*dx+dy*dy))
      ), runs as (
        select min(i) as start, count(*) as len
        from (select i, i - row_number() over(order by i) as grp from visible) v group by grp
      )
      select jsonb_build_object('width',mw,'height',mh,'runs',
        coalesce(jsonb_agg(jsonb_build_array(start,len) order by start),'[]'::jsonb)) into clipped from runs;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'position',origin, 'type',item->'type', 'color',item->'color', 'intensity',item->'intensity',
    'beam',item->'beam', 'beamWidth',item->'beamWidth', 'edgeSoftness',item->'edgeSoftness',
    'range',item->'range', 'height',item->'height', 'direction',case
      when item->>'type' in ('solljus','manljus')
        and jsonb_typeof(config->'north') = 'number'
        and jsonb_typeof(item->'direction') = 'number'
      then to_jsonb((item->>'direction')::numeric + (config->>'north')::numeric - 90)
      else item->'direction' end,
    'aperture',item->'aperture', 'inclination',item->'inclination', 'motion',item->'motion', 'on',true
  ) order by ordinal),'[]'::jsonb) into lights
  from jsonb_array_elements(config->'lights') with ordinality g(item,ordinal)
  left join public.campaign_map_character_positions pos on p_combat_id is null and pos.map_id = p_map_id
    and pos.campaign_id = map_row.campaign_id and pos.character_id::text = item->>'characterId'
  left join public.combatants actor on p_combat_id is not null and actor.combat_id = p_combat_id
    and actor.campaign_id = map_row.campaign_id and actor.source_type = 'character'
    and actor.source_id::text = item->>'characterId'
    and private.battle_actor_explored(p_map_id,map_row.campaign_id,encounter_settings,actor)
  cross join lateral (select private.battle_map_center(encounter_settings,actor.q,actor.r) as center) c
  cross join lateral (select case
    when coalesce(item->>'characterId','') = '' then item->'position'
    when p_combat_id is null then pos.position
    when actor.id is not null then jsonb_build_array(c.center[0],c.center[1])
    end as origin) f
  where has_visible_mask and item->'playerVisible' = 'true'::jsonb and item->'on' = 'true'::jsonb
    and exists (select 1 from unnest(rooms) room where room @> point((origin->>0)::float8,(origin->>1)::float8))
    and not exists (select 1 from unnest(concealed) room where room @> point((origin->>0)::float8,(origin->>1)::float8));

  return jsonb_build_object('darkness',config->'darkness','pixelsPerMeter',config->'pixelsPerMeter',
    'freeSight',clipped,'lights',lights,'geometry','[]'::jsonb)
    || case when p_combat_id is null then '{}'::jsonb else jsonb_build_object(
         'pixelsPerMeter',encounter_settings->'pixels_per_meter',
         'maskRevision',mask_revision,'maskUnchanged',reuse_mask,
         'environment',case when config->>'environment' in ('outdoor','indoor','underground')
           then config->>'environment' else 'indoor' end)
       end;
end;
$$;

revoke all on function private.project_map_academy(uuid, uuid, text) from public, anon, authenticated;

create or replace function public.read_campaign_map_academy_player(p_map_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select private.project_map_academy(p_map_id, null) $$;

create function public.read_combat_map_academy_player(p_combat_id uuid, p_known_mask_revision text default null)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select private.project_map_academy(ci.map_id, ci.id, p_known_mask_revision)
  from public.combat_instances ci
  where ci.id = p_combat_id and ci.settings->'academy_map' = 'true'::jsonb
    and ci.status in ('active','paused','completed') and (select auth.uid()) is not null and private.is_campaign_member(ci.campaign_id)
$$;
revoke all on function public.read_combat_map_academy_player(uuid,text) from public, anon;
grant execute on function public.read_combat_map_academy_player(uuid,text) to authenticated;
