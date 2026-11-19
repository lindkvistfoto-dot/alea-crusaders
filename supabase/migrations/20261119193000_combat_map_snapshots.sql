-- Geometry, lighting and artwork for one fight must refer to the same edition
-- of the academy map. Discovery and permissions still follow the campaign.
create table private.combat_map_snapshots (
  combat_id uuid primary key references public.combat_instances(id) on delete cascade,
  map_id uuid not null,
  campaign_id uuid not null,
  width integer not null,
  height integer not null,
  image_path text not null,
  configuration jsonb,
  objects jsonb not null
);
revoke all on table private.combat_map_snapshots from public, anon, authenticated;

create function private.snapshot_combat_map() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.combat_map_snapshots(combat_id,map_id,campaign_id,width,height,image_path,configuration,objects)
    select new.id, m.id, m.campaign_id, m.width, m.height, m.image_path, a.configuration,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', o.id, 'x', o.x, 'y', o.y, 'rotation', o.rotation,
          'movement_blocking', o.movement_blocking, 'light_blocking', o.light_blocking, 'shadow_casting', o.shadow_casting,
          'asset_path', art.asset_path,
          'definition', jsonb_build_object('name', d.name, 'image_asset_key', d.image_asset_key,
            'image_crop', d.image_crop, 'width_m', d.width_m, 'depth_m', d.depth_m, 'height_m', d.height_m)
        ) order by o.created_at,o.id)
        from public.campaign_map_objects o
        join public.arcane_object_definitions d on d.id = o.object_definition_id
        left join public.arcane_system_assets art on art.asset_key = d.image_asset_key
        where o.map_id = m.id and o.campaign_id = m.campaign_id
      ), '[]'::jsonb)
    from public.campaign_maps m
    left join public.campaign_map_academy a on a.map_id = m.id and a.campaign_id = m.campaign_id
    where m.id = new.map_id and m.campaign_id = new.campaign_id
      and m.width = (new.settings->>'background_width')::integer
      and m.height = (new.settings->>'background_height')::integer
      and coalesce(m.pixels_per_meter,(a.configuration->>'pixelsPerMeter')::numeric)
          = (new.settings->>'pixels_per_meter')::numeric;
  if not found then
    raise exception 'Kartans skala eller storlek har ändrats. Hämta kartans kalibrering i stridsscenen.';
  end if;
  return new;
end;
$$;
revoke all on function private.snapshot_combat_map() from public, anon, authenticated;
create trigger snapshot_linked_combat_map after insert on public.combat_instances
  for each row when (new.settings->'academy_map' = 'true'::jsonb)
  execute function private.snapshot_combat_map();

-- Raw sight geometry and light ownership are available only to the GM.
create function public.read_combat_map_source(p_combat_id uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select s.configuration from private.combat_map_snapshots s
  where s.combat_id = p_combat_id and (select auth.uid()) is not null
    and (private.is_admin() or private.is_campaign_gm(s.campaign_id))
$$;
revoke all on function public.read_combat_map_source(uuid) from public, anon;
grant execute on function public.read_combat_map_source(uuid) to authenticated;

create function public.read_combat_map_objects(p_combat_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  scene record;
begin
  select s.*, m.image_path as current_path, m.width as current_width, m.height as current_height,
    private.is_admin() or private.is_campaign_gm(s.campaign_id) as manager
  into scene
  from private.combat_map_snapshots s
  join public.combat_instances ci on ci.id = s.combat_id and ci.map_id = s.map_id and ci.campaign_id = s.campaign_id
  join public.campaign_maps m on m.id = s.map_id and m.campaign_id = s.campaign_id
  where s.combat_id = p_combat_id and (select auth.uid()) is not null
    and (private.is_admin() or private.is_campaign_gm(s.campaign_id)
      or (ci.status in ('active','paused','completed') and m.player_visible and private.is_campaign_member(s.campaign_id)));
  if not found then return '[]'::jsonb; end if;
  if scene.image_path is distinct from scene.current_path or scene.width <> scene.current_width
      or scene.height <> scene.current_height then
    raise exception 'Kartbilden har bytts ut efter stridsstart. Öppna stridsscenen med den nya kartbilden.';
  end if;
  if scene.manager then return scene.objects; end if;
  return (select coalesce(jsonb_agg(obj order by ordinal), '[]'::jsonb)
    from jsonb_array_elements(scene.objects) with ordinality as placements(obj, ordinal)
    where private.is_campaign_map_object_discovered(scene.map_id, scene.campaign_id,
      point((obj->>'x')::float8,(obj->>'y')::float8)));
end;
$$;
revoke all on function public.read_combat_map_objects(uuid) from public, anon;
grant execute on function public.read_combat_map_objects(uuid) to authenticated;

-- A lighting cue and an initiative update can safely change the same encounter.
-- Write just the presentation flag, with the previous flag as the concurrency check.
create function public.set_combat_map_lights_out(p_combat_id uuid, p_expected boolean, p_lights_out boolean)
returns boolean language sql volatile security invoker set search_path = ''
as $$
  with changed as (
    update public.combat_instances ci
    set settings = jsonb_set(ci.settings, '{map_lights_out}', to_jsonb(p_lights_out)),
        updated_at = clock_timestamp()
    where ci.id = p_combat_id and ci.settings->'academy_map' = 'true'::jsonb
      and ci.status in ('setup','active','paused')
      and (select auth.uid()) is not null
      and (private.is_admin() or private.is_campaign_gm(ci.campaign_id))
      and coalesce(ci.settings->'map_lights_out','false'::jsonb) = to_jsonb(p_expected)
      and p_lights_out is not null
    returning ci.id
  )
  select exists (select from changed)
$$;
revoke all on function public.set_combat_map_lights_out(uuid,boolean,boolean) from public, anon;
grant execute on function public.set_combat_map_lights_out(uuid,boolean,boolean) to authenticated;
