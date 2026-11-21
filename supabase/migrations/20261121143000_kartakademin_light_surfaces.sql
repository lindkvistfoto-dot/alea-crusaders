-- Extend only the member's display projection. Room discovery, portable light
-- origins and the blocker raster still come from the original permission check.
create function public.read_campaign_map_lighting(p_map_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  display jsonb := public.read_campaign_map_academy_player(p_map_id);
  config jsonb;
  faces jsonb;
begin
  if display is null then return null; end if;
  select configuration into config from public.campaign_map_academy where map_id = p_map_id;
  if config->>'lightingModel' = 'painted' then
    display := display || '{"lightingModel":"painted"}'::jsonb;
  end if;
  if not exists (select from jsonb_array_elements(config->'geometry') g where g ? 'face') then
    return display;
  end if;

  with rooms as (
    select coalesce(s.status,'unknown') status,
      case when a.shape_type = 'rect' then polygon(box(
        point((a.shape_data->>'x')::float8,(a.shape_data->>'y')::float8),
        point((a.shape_data->>'x')::float8 + (a.shape_data->>'width')::float8,
              (a.shape_data->>'y')::float8 + (a.shape_data->>'height')::float8)))
      when jsonb_array_length(a.shape_data->'points') >= 3 then
        (select ('(' || string_agg(format('(%s,%s)', (v->>0)::float8, (v->>1)::float8), ',' order by n) || ')')::polygon
         from jsonb_array_elements(a.shape_data->'points') with ordinality p(v,n))
      end as region
    from public.campaign_map_areas a
    left join public.campaign_location_state s on s.location_id=a.location_id and s.campaign_id=a.campaign_id
    where a.map_id=p_map_id
  ), strips as (
    select g,
      (select ('(' || string_agg(format('(%s,%s)',(v->>0)::float8,(v->>1)::float8),',' order by n) || ')')::polygon
       from jsonb_array_elements(jsonb_build_array(g->'points'->0,g->'points'->1,g->'face'->1,g->'face'->0))
            with ordinality p(v,n)) as region
    from jsonb_array_elements(config->'geometry') g
    where g->'light'='true'::jsonb and g->'closed'='false'::jsonb
      and jsonb_array_length(g->'points')=2 and jsonb_array_length(g->'face')=2
  )
  select coalesce(jsonb_agg(jsonb_build_object('points',g->'points','face',g->'face')), '[]'::jsonb)
    into faces from strips
    where exists (select from rooms r where r.status='explored' and r.region @> strips.region)
      and not exists (select from rooms r where r.status<>'explored' and r.region && strips.region);
  return display || jsonb_build_object('visibleFaces',faces);
end;
$$;
revoke all on function public.read_campaign_map_lighting(uuid) from public, anon;
grant execute on function public.read_campaign_map_lighting(uuid) to authenticated;
