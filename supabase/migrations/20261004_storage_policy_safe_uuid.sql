-- Alea Crusaders
-- Harden Storage RLS so legacy/non-UUID object paths do not break map access.

drop policy if exists campaign_maps_storage_select on storage.objects;
create policy campaign_maps_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_member(
      case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(name, '/', 1)::uuid
        else null
      end
    )
  )
);

drop policy if exists campaign_maps_storage_insert on storage.objects;
create policy campaign_maps_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(
      case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(name, '/', 1)::uuid
        else null
      end
    )
  )
);

drop policy if exists campaign_maps_storage_update on storage.objects;
create policy campaign_maps_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(
      case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(name, '/', 1)::uuid
        else null
      end
    )
  )
)
with check (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(
      case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(name, '/', 1)::uuid
        else null
      end
    )
  )
);

drop policy if exists campaign_maps_storage_delete on storage.objects;
create policy campaign_maps_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(
      case
        when split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(name, '/', 1)::uuid
        else null
      end
    )
  )
);
