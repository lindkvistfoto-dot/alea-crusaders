-- In nested rule_projectile_types lookup, qualify storage.objects.name.
-- Otherwise PostgreSQL resolves the unqualified name to p.name, blocking uploads.
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
   and exists(
    select 1 from public.rule_projectile_types p
    where p.projectile_key=split_part(storage.objects.name,'/',2)
   )
  )
 )
);
