alter table public.campaign_npcs
  add column if not exists image_path text,
  add column if not exists attributes jsonb not null default '{}'::jsonb,
  add column if not exists skills jsonb not null default '[]'::jsonb,
  add column if not exists weapons jsonb not null default '[]'::jsonb,
  add column if not exists shield jsonb not null default '{}'::jsonb,
  add column if not exists armor jsonb not null default '{}'::jsonb;

alter table public.campaign_npcs
  drop constraint if exists campaign_npcs_attributes_object,
  drop constraint if exists campaign_npcs_skills_array,
  drop constraint if exists campaign_npcs_weapons_array,
  drop constraint if exists campaign_npcs_shield_object,
  drop constraint if exists campaign_npcs_armor_object;

alter table public.campaign_npcs
  add constraint campaign_npcs_attributes_object check (jsonb_typeof(attributes)='object'),
  add constraint campaign_npcs_skills_array check (jsonb_typeof(skills)='array'),
  add constraint campaign_npcs_weapons_array check (jsonb_typeof(weapons)='array'),
  add constraint campaign_npcs_shield_object check (jsonb_typeof(shield)='object'),
  add constraint campaign_npcs_armor_object check (jsonb_typeof(armor)='object');

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'campaign-actor-images',
  'campaign-actor-images',
  false,
  8388608,
  array['image/png','image/jpeg','image/webp']
)
on conflict (id) do update
set public=false,
    file_size_limit=excluded.file_size_limit,
    allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "campaign_actor_images_select" on storage.objects;
create policy "campaign_actor_images_select"
on storage.objects for select to authenticated
using (
  bucket_id='campaign-actor-images'
  and exists (
    select 1 from public.campaign_npcs n
    where n.image_path=storage.objects.name
      and (
        (select private.is_admin())
        or (select private.is_campaign_gm(n.campaign_id))
        or (n.player_visible and (select private.is_campaign_member(n.campaign_id)))
      )
  )
);

drop policy if exists "campaign_actor_images_insert" on storage.objects;
create policy "campaign_actor_images_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id='campaign-actor-images'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and ((select private.is_admin()) or (select private.is_campaign_gm((split_part(name,'/',1))::uuid)))
);

drop policy if exists "campaign_actor_images_update" on storage.objects;
create policy "campaign_actor_images_update"
on storage.objects for update to authenticated
using (
  bucket_id='campaign-actor-images'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and ((select private.is_admin()) or (select private.is_campaign_gm((split_part(name,'/',1))::uuid)))
)
with check (
  bucket_id='campaign-actor-images'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and ((select private.is_admin()) or (select private.is_campaign_gm((split_part(name,'/',1))::uuid)))
);

drop policy if exists "campaign_actor_images_delete" on storage.objects;
create policy "campaign_actor_images_delete"
on storage.objects for delete to authenticated
using (
  bucket_id='campaign-actor-images'
  and split_part(name,'/',1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  and ((select private.is_admin()) or (select private.is_campaign_gm((split_part(name,'/',1))::uuid)))
);
