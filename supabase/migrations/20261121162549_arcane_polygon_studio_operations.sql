-- Enforce the same scope as the GM's place picker, including writes through
-- the existing table API. Existing links are inspected only when reassigned.
create or replace function private.check_polygon_location_scope()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  root_site uuid;
begin
  if new.location_id is null then return new; end if;
  if tg_op = 'UPDATE' then
    if (new.map_id, new.campaign_id, new.location_id) is not distinct from
       (old.map_id, old.campaign_id, old.location_id) then return new; end if;
  end if;
  select m.site_id into strict root_site from public.campaign_maps m
    where m.id = new.map_id and m.campaign_id = new.campaign_id;
  -- Unscoped historical maps use the campaign; the existing composite FKs
  -- enforce the campaign of both map and location.
  if root_site is not null and not exists (
    with recursive subtree(id) as (
      select root_site
      union
      select s.id from public.campaign_sites s join subtree t on s.parent_site_id = t.id
        where s.campaign_id = new.campaign_id
    )
    select 1 from public.campaign_locations l join subtree on subtree.id = l.site_id
      where l.id = new.location_id and l.campaign_id = new.campaign_id
  ) then
    raise exception 'Platsen hör inte till kartans struktur.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger campaign_map_area_location_scope
before insert or update of map_id, campaign_id, location_id on public.campaign_map_areas
for each row execute function private.check_polygon_location_scope();

-- A command carries exact editable before/after rows (null = absent), and a
-- compact version for each visible area. Thus two independently valid edits
-- cannot commit against different pictures of the surrounding room geometry.
create or replace function public.apply_map_polygon_operation(
  p_map_id uuid, p_changes jsonb, p_versions jsonb
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  map_campaign uuid;
  versions jsonb;
  expected jsonb;
  ids text[];
  change jsonb;
  area_id uuid;
  current_row jsonb;
  desired jsonb;
  before_matches boolean := true;
  after_matches boolean := true;
  checking_shape boolean;
begin
  if auth.uid() is null then raise exception 'Inloggning krävs.' using errcode = '42501'; end if;
  select m.campaign_id into map_campaign from public.campaign_maps m where m.id = p_map_id for update;
  if not found or (private.is_admin() or private.is_campaign_gm(map_campaign)) is not true then
    raise exception 'Endast kartans spelledare eller administratör kan spara.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_typeof(p_versions) is distinct from 'object' then
    raise exception 'Ogiltig polygonändring.';
  end if;
  select array_agg(distinct (entry->>'id')::uuid::text) into ids from jsonb_array_elements(p_changes) entry;
  if ids is null or array_position(ids, null) is not null or cardinality(ids) <> jsonb_array_length(p_changes) then
    raise exception 'Varje berörd polygon måste ha en unik identitet.';
  end if;

  -- The map lock serializes workshop edits and the legacy atomic geometry RPC.
  -- Row locks also cover concurrent direct updates through the old table API.
  perform a.id from public.campaign_map_areas a where a.map_id = p_map_id order by a.id for update;
  select coalesce(jsonb_object_agg(a.id::text, a.updated_at), '{}'::jsonb) into versions
    from public.campaign_map_areas a where a.map_id = p_map_id;
  select coalesce(jsonb_object_agg(key, value::timestamptz), '{}'::jsonb) into expected
    from jsonb_each_text(p_versions);

  for change in select value from jsonb_array_elements(p_changes) loop
    area_id := (change->>'id')::uuid;
    if not (change ?& array['before','after']) or change->'before' = change->'after' then
      raise exception 'Polygonåtgärden måste innehålla en ändring.';
    end if;
    desired := change->'after';
    if desired <> 'null'::jsonb then
      if jsonb_typeof(desired) <> 'object' or not (desired ?& array['shape_type','shape_data','sort_order','location_id'])
        or desired->>'shape_type' not in ('rect','polygon') or jsonb_typeof(desired->'shape_data') <> 'object' then
        raise exception 'Ogiltig polygonform.';
      end if;
      checking_shape := (desired->'shape_type', desired->'shape_data') is distinct from
        (change->'before'->'shape_type', change->'before'->'shape_data');
      if checking_shape and desired->>'shape_type' = 'polygon' then
        if jsonb_typeof(desired->'shape_data'->'points') is distinct from 'array' then raise exception 'Hörnpunkter saknas.'; end if;
        if jsonb_array_length(desired->'shape_data'->'points') < 3 or exists (
          select 1 from jsonb_array_elements(desired->'shape_data'->'points') p
          where case when jsonb_typeof(p) = 'array' then jsonb_array_length(p) <> 2 else true end
            or jsonb_typeof(p->0) is distinct from 'number' or jsonb_typeof(p->1) is distinct from 'number'
        ) then raise exception 'Ogiltiga hörnpunkter.'; end if;
      end if;
    end if;
    select jsonb_build_object('shape_type', a.shape_type, 'shape_data', a.shape_data,
        'location_id', a.location_id, 'sort_order', a.sort_order)
      into current_row from public.campaign_map_areas a where a.map_id = p_map_id and a.id = area_id;
    current_row := coalesce(current_row, 'null'::jsonb);
    before_matches := before_matches and current_row = change->'before';
    after_matches := after_matches and current_row = desired;
  end loop;

  -- A response can be lost after COMMIT. Only acknowledge a retry if the whole
  -- after-state matches and other rooms retain the exact versions seen by the GM.
  if after_matches and (versions - ids) = (expected - ids) then return versions; end if;
  if not before_matches or versions <> expected then
    raise exception 'Kartans polygoner har ändrats. Öppna kartan igen.' using errcode = '40001';
  end if;

  for change in select value from jsonb_array_elements(p_changes) loop
    area_id := (change->>'id')::uuid;
    desired := change->'after';
    if desired = 'null'::jsonb then
      delete from public.campaign_map_areas where id = area_id and map_id = p_map_id;
    elsif change->'before' = 'null'::jsonb then
      insert into public.campaign_map_areas (id, campaign_id, map_id, location_id, shape_type, shape_data, sort_order)
        values (area_id, map_campaign, p_map_id, (desired->>'location_id')::uuid,
          desired->>'shape_type', desired->'shape_data', (desired->>'sort_order')::integer);
    else
      update public.campaign_map_areas set location_id = (desired->>'location_id')::uuid,
        shape_type = desired->>'shape_type', shape_data = desired->'shape_data',
        sort_order = (desired->>'sort_order')::integer
        where id = area_id and map_id = p_map_id;
    end if;
    if not found then raise exception 'Polygonen kunde inte sparas.'; end if;
  end loop;

  select coalesce(jsonb_object_agg(a.id::text, a.updated_at), '{}'::jsonb) into versions
    from public.campaign_map_areas a where a.map_id = p_map_id;
  return versions;
end;
$$;

revoke all on function public.apply_map_polygon_operation(uuid,jsonb,jsonb) from public, anon;
grant execute on function public.apply_map_polygon_operation(uuid,jsonb,jsonb) to authenticated;
