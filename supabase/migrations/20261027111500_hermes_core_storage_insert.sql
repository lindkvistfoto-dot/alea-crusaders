-- HERMES CORE: allow ALEA administrators to upload immutable WebP
-- system assets directly to the existing public bucket.
-- Existing HERMES ALEA policies and objects are untouched.
create policy "hermes_core_system_asset_insert"
on storage.objects for insert to authenticated
with check (
 bucket_id = 'alea-hermes-public'
 and name ~ '^hermes/system-asset/[a-z0-9][a-z0-9_-]*/[a-f0-9]{64}\\.webp$'
 and (select private.is_admin())
);
