-- Shared round panel image register. Administrators manage the gallery;
-- authenticated players may read it so everyone sees the same combat image.
create table if not exists public.rule_combat_round_backgrounds (
 id uuid primary key default gen_random_uuid(),
 title text not null check(length(btrim(title)) between 1 and 120),
 image_path text not null unique,
 is_active boolean not null default true,
 archived_at timestamptz,
 created_by uuid default auth.uid(),
 created_at timestamptz not null default now(),
 constraint round_background_image_path_check check (
   image_path='assets/combat/round-hero-battle-pilot.avif'
   or (image_path ~ '^round/[0-9a-f-]{36}\\.(webp|png|jpg|jpeg)$'
       and split_part(split_part(image_path,'/',2),'.',1)=id::text)
 )
);
create index if not exists round_background_pool_idx
 on public.rule_combat_round_backgrounds (created_at) where is_active and archived_at is null;
alter table public.rule_combat_round_backgrounds enable row level security;
grant select,insert,update on public.rule_combat_round_backgrounds to authenticated;
revoke delete on public.rule_combat_round_backgrounds from authenticated;
create policy round_backgrounds_read on public.rule_combat_round_backgrounds
 for select to authenticated using (true);
create policy round_backgrounds_admin_insert on public.rule_combat_round_backgrounds
 for insert to authenticated with check ((select private.is_admin()));
create policy round_backgrounds_admin_update on public.rule_combat_round_backgrounds
 for update to authenticated using ((select private.is_admin()))
 with check ((select private.is_admin()));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('alea-round-backgrounds','alea-round-backgrounds',false,6291456,
        array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;
create policy round_background_storage_read on storage.objects
 for select to authenticated using (
 bucket_id='alea-round-backgrounds'
 and name ~ '^round/[0-9a-f-]{36}\\.(webp|png|jpg|jpeg)$'
);
create policy round_background_storage_admin_upload on storage.objects
 for insert to authenticated with check (
 bucket_id='alea-round-backgrounds'
 and name ~ '^round/[0-9a-f-]{36}\\.(webp|png|jpg|jpeg)$'
 and (select private.is_admin())
);
-- A removed gallery row is archived instead of deleting storage: old encounters
-- keep their selected image. An admin may clean up an orphan after upload failure.
create policy round_background_storage_admin_cleanup on storage.objects
 for delete to authenticated using (
 bucket_id='alea-round-backgrounds'
 and name ~ '^round/[0-9a-f-]{36}\\.(webp|png|jpg|jpeg)$'
 and (select private.is_admin())
 and not exists(
  select 1 from public.rule_combat_round_backgrounds r
  where r.image_path=storage.objects.name
 )
);
insert into public.rule_combat_round_backgrounds(title,image_path,is_active)
select 'Frostbestens slagfält','assets/combat/round-hero-battle-pilot.avif',true
where not exists (select 1 from public.rule_combat_round_backgrounds
                  where image_path='assets/combat/round-hero-battle-pilot.avif');
