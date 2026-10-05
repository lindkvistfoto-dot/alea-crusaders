-- Alea Crusaders – scene-local combat map backgrounds
-- A directly uploaded combat image belongs to the combat scene and is not a permanent campaign/location map.

alter table public.campaign_combat_scenes
  add column if not exists background_image_path text,
  add column if not exists background_width integer,
  add column if not exists background_height integer;

alter table public.campaign_combat_scenes
  drop constraint if exists campaign_combat_scenes_background_dimensions_check;

alter table public.campaign_combat_scenes
  add constraint campaign_combat_scenes_background_dimensions_check
  check (
    (background_image_path is null and background_width is null and background_height is null)
    or
    (background_image_path is not null and background_width > 0 and background_height > 0)
  );

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'combat-scene-maps',
  'combat-scene-maps',
  false,
  20971520,
  array['image/png','image/jpeg','image/webp']::text[]
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists combat_scene_maps_storage_select on storage.objects;
create policy combat_scene_maps_storage_select
on storage.objects for select to authenticated
using (
  bucket_id='combat-scene-maps'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (select private.is_campaign_gm(split_part(name,'/',1)::uuid))
    )
  )
);

drop policy if exists combat_scene_maps_storage_insert on storage.objects;
create policy combat_scene_maps_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id='combat-scene-maps'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (select private.is_campaign_gm(split_part(name,'/',1)::uuid))
    )
  )
);

drop policy if exists combat_scene_maps_storage_update on storage.objects;
create policy combat_scene_maps_storage_update
on storage.objects for update to authenticated
using (
  bucket_id='combat-scene-maps'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (select private.is_campaign_gm(split_part(name,'/',1)::uuid))
    )
  )
)
with check (
  bucket_id='combat-scene-maps'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (select private.is_campaign_gm(split_part(name,'/',1)::uuid))
    )
  )
);

drop policy if exists combat_scene_maps_storage_delete on storage.objects;
create policy combat_scene_maps_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id='combat-scene-maps'
  and (
    (select private.is_admin())
    or (
      split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and (select private.is_campaign_gm(split_part(name,'/',1)::uuid))
    )
  )
);

comment on column public.campaign_combat_scenes.background_image_path is
  'Optional scene-local background image in Storage bucket combat-scene-maps. This is not a campaign_maps/location map.';
