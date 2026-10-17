-- Smart Polygon Editor: one transaction for all shared-vertex updates.
-- SECURITY INVOKER preserves campaign_map_areas RLS for the calling user.
create or replace function public.update_map_polygon_shapes_atomic(
 p_map_id uuid,
 p_changes jsonb
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
 v_map public.campaign_maps%rowtype;
 v_row jsonb;
 v_id uuid;
 v_expected_type text;
 v_expected jsonb;
 v_points jsonb;
 v_count integer := 0;
 v_expected_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 100 then
  raise exception 'Invalid polygon batch';
 end if;
 select * into v_map from public.campaign_maps where id=p_map_id for update;
 if not found then raise exception 'Map not found or inaccessible' using errcode='42501'; end if;
 if not (private.is_admin() or private.is_campaign_gm(v_map.campaign_id)) then
  raise exception 'Game master permission required' using errcode='42501';
 end if;
 -- Require unique IDs to avoid replaying an individual row in one batch.
 select count(distinct (item->>'id')) into v_expected_count from jsonb_array_elements(p_changes) item;
 if v_expected_count <> jsonb_array_length(p_changes) then raise exception 'Duplicate or missing polygon IDs'; end if;
 -- Validate every expected shape before ANY write.
 for v_row in select value from jsonb_array_elements(p_changes)
 loop
  v_id := (v_row->>'id')::uuid;
  v_expected_type := v_row->>'before_type';
  v_expected := v_row->'before_data';
  v_points := v_row->'points';
  if v_expected_type not in ('polygon','rect') or v_expected is null or
     jsonb_typeof(v_points) is distinct from 'array' or jsonb_array_length(v_points) < 3 or jsonb_array_length(v_points) > 5000 then
   raise exception 'Invalid polygon change';
  end if;
  if exists(select 1 from jsonb_array_elements(v_points) p
   where jsonb_typeof(p.value) is distinct from 'array' or jsonb_array_length(p.value) <> 2 or
   jsonb_typeof(p.value->0) <> 'number' or jsonb_typeof(p.value->1) <> 'number') then
   raise exception 'Invalid point coordinates';
  end if;
  perform 1 from public.campaign_map_areas a
   where a.id=v_id and a.map_id=p_map_id and a.shape_type=v_expected_type and a.shape_data=v_expected
   for update;
  if not found then raise exception 'Polygon changed since editor opened; reload map';
  end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_changes)
 loop
  update public.campaign_map_areas
   set shape_type='polygon',shape_data=jsonb_build_object('points',v_row->'points'),updated_at=now()
   where id=(v_row->>'id')::uuid and map_id=p_map_id;
  if not found then raise exception 'Polygon save failed'; end if;
  v_count := v_count+1;
 end loop;
 return v_count;
end;
$$;
revoke all on function public.update_map_polygon_shapes_atomic(uuid,jsonb) from public, anon;
grant execute on function public.update_map_polygon_shapes_atomic(uuid,jsonb) to authenticated;
