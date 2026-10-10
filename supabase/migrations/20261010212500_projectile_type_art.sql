-- Alea Crusaders v0.35.70: one shared inventory image per projectile master type.
-- Keep projectile IDs textual, matching rule_projectile_types.projectile_key.
alter table public.rule_projectile_types
  add column if not exists image_path text;

comment on column public.rule_projectile_types.image_path is
  'Public equipment artwork at projectile/<projectile_key>/<file_uuid>.webp or .png';

do $$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.rule_projectile_types'::regclass
    and conname='rule_projectile_image_path_check'
 ) then
  alter table public.rule_projectile_types
   add constraint rule_projectile_image_path_check
   check (
    image_path is null or (
     image_path ~ '^projectile/[a-z][a-z0-9_]{1,50}/[0-9a-f-]{36}\.(webp|png)$'
     and split_part(image_path,'/',2)=projectile_key
    )
   );
 end if;
end $$;

-- Reuse existing equipment-art bucket, admin write ACL, and authenticated read
-- ACL without changing unrelated material storage.
drop policy if exists equipment_art_insert_admin on storage.objects;
create policy equipment_art_insert_admin on storage.objects
for insert to authenticated with check (
 bucket_id='alea-equipment-art'
 and (select private.is_admin())
 and (
  name ~ '^(weapon|armor|shield)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
  or name ~ '^armor/(head|arms|torso|legs)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
  or (
    name ~ '^projectile/[a-z][a-z0-9_]{1,50}/[0-9a-f-]{36}\.(webp|png)$'
    and exists (
      select 1 from public.rule_projectile_types p
      where p.projectile_key=split_part(name,'/',2)
    )
  )
 )
);
