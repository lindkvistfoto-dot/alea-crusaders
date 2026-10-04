-- Alea Crusaders - location information images
-- Private storage for room/location images with player/GM visibility enforced by RLS.

insert into storage.buckets (id, name, public)
values ('campaign-location-assets', 'campaign-location-assets', false)
on conflict (id) do update set public = false;

drop policy if exists campaign_location_assets_storage_select on storage.objects;
create policy campaign_location_assets_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1
    from public.campaign_location_assets a
    where a.storage_path = storage.objects.name
      and (
        private.is_admin()
        or private.is_campaign_gm(a.campaign_id)
        or (
          a.player_visible = true
          and private.is_campaign_member(a.campaign_id)
          and exists (
            select 1
            from public.campaign_location_state s
            where s.location_id = a.location_id
              and s.status <> 'unknown'
          )
        )
      )
  )
);

drop policy if exists campaign_location_assets_storage_insert on storage.objects;
create policy campaign_location_assets_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1
    from public.campaign_location_assets a
    where a.storage_path = storage.objects.name
      and (private.is_admin() or private.is_campaign_gm(a.campaign_id))
  )
);

drop policy if exists campaign_location_assets_storage_update on storage.objects;
create policy campaign_location_assets_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1
    from public.campaign_location_assets a
    where a.storage_path = storage.objects.name
      and (private.is_admin() or private.is_campaign_gm(a.campaign_id))
  )
)
with check (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1
    from public.campaign_location_assets a
    where a.storage_path = storage.objects.name
      and (private.is_admin() or private.is_campaign_gm(a.campaign_id))
  )
);

drop policy if exists campaign_location_assets_storage_delete on storage.objects;
create policy campaign_location_assets_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1
    from public.campaign_location_assets a
    where a.storage_path = storage.objects.name
      and (private.is_admin() or private.is_campaign_gm(a.campaign_id))
  )
);
