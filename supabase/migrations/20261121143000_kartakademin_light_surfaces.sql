-- Forward replacement also brings previously deployed V1 projections up to
-- date with directional beams and map north. The endpoint and ACL stay stable.
create or replace function public.read_campaign_map_academy_player(p_map_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  map_row record;
  config jsonb;
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
  lights jsonb;
  faces jsonb;
begin
  select m.campaign_id, m.width, m.height, a.configuration
    into map_row
    from public.campaign_maps m
    join public.campaign_map_academy a on a.map_id = m.id and a.campaign_id = m.campaign_id
    where m.id = p_map_id and m.player_visible and private.is_campaign_member(m.campaign_id)
      and (select auth.uid()) is not null;
  if not found then return null; end if;
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
    if mw between 1 and 1536 and mh between 1 and 1536 then
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
  left join public.campaign_map_character_positions pos on pos.map_id = p_map_id
    and pos.campaign_id = map_row.campaign_id and pos.character_id::text = item->>'characterId'
  cross join lateral (select case when coalesce(item->>'characterId','') = '' then item->'position' else pos.position end as origin) f
  where clipped is not null and item->'playerVisible' = 'true'::jsonb and item->'on' = 'true'::jsonb
    and exists (select 1 from unnest(rooms) room where room @> point((origin->>0)::float8,(origin->>1)::float8))
    and not exists (select 1 from unnest(concealed) room where room @> point((origin->>0)::float8,(origin->>1)::float8));

  if rooms is not null then
    -- A receiver spanning a concealed boundary is omitted as a whole. Only
    -- the four image points of fully explored strips leave the GM contract.
    with strips as (
      select g, cast(('(' || corners.boundary || ')') as polygon) as region,
                cast(('(' || corners.interior || ')') as polygon) as interior
      from jsonb_array_elements(config->'geometry') g
      cross join lateral (
        -- Ignore zero-area contact with the neighbouring room. The tiny inset
        -- is below map-pixel resolution; the renderer still clips by discovery.
        select string_agg(format('(%s,%s)',x,y),',' order by n) as boundary,
               string_agg(format('(%s,%s)',x+(cx-x)*1e-5,y+(cy-y)*1e-5),',' order by n) as interior
        from (
          select n, x, y, avg(x) over() as cx, avg(y) over() as cy
          from jsonb_array_elements(jsonb_build_array(g->'points'->0,g->'points'->1,g->'face'->1,g->'face'->0))
               with ordinality p(v,n)
          cross join lateral (select (v->>0)::float8 x,(v->>1)::float8 y) xy
        ) vertices
      ) corners
      where g->'light'='true'::jsonb and g->'closed'='false'::jsonb
        and jsonb_array_length(g->'points')=2
        and case when jsonb_typeof(g->'face')='array' then jsonb_array_length(g->'face')=2 else false end
    )
    select jsonb_agg(jsonb_build_object('points',g->'points','face',g->'face')) into faces
    from strips where exists (select from unnest(rooms) r where r @> strips.region)
      and not exists (select from unnest(concealed) r where r && strips.interior);
  end if;

  return jsonb_build_object('darkness',config->'darkness','pixelsPerMeter',config->'pixelsPerMeter',
    'freeSight',clipped,'lights',lights,'geometry','[]'::jsonb)
    || case when faces is null then '{}'::jsonb else jsonb_build_object('visibleFaces',faces) end
    || case when config->>'lightingModel'='painted' then '{"lightingModel":"painted"}'::jsonb else '{}'::jsonb end;
end;
$$;
revoke all on function public.read_campaign_map_academy_player(uuid) from public, anon;
grant execute on function public.read_campaign_map_academy_player(uuid) to authenticated;
