-- Alea Crusaders
-- Player map library: current map and player visibility are separate concepts.
-- GMs/admins can see all maps. Players can only see maps explicitly made available.

drop policy if exists campaign_maps_select on public.campaign_maps;
create policy campaign_maps_select
on public.campaign_maps
for select
to authenticated
using (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
  or (
    player_visible = true
    and private.is_campaign_member(campaign_id)
  )
);

drop policy if exists campaign_map_areas_select on public.campaign_map_areas;
create policy campaign_map_areas_select
on public.campaign_map_areas
for select
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.campaign_maps m
    where m.id = campaign_map_areas.map_id
      and (
        private.is_campaign_gm(m.campaign_id)
        or (
          m.player_visible = true
          and private.is_campaign_member(m.campaign_id)
        )
      )
  )
);

drop policy if exists campaign_map_settings_select on public.campaign_map_settings;
create policy campaign_map_settings_select
on public.campaign_map_settings
for select
to authenticated
using (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
  or (
    private.is_campaign_member(campaign_id)
    and exists (
      select 1
      from public.campaign_maps m
      where m.id = campaign_map_settings.active_map_id
        and m.player_visible = true
    )
  )
);

drop policy if exists campaign_maps_storage_select on storage.objects;
create policy campaign_maps_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campaign-maps'
  and exists (
    select 1
    from public.campaign_maps m
    where split_part(storage.objects.name, '/', 1) = m.campaign_id::text
      and split_part(storage.objects.name, '/', 2) = m.id::text
      and (
        private.is_admin()
        or private.is_campaign_gm(m.campaign_id)
        or (
          m.player_visible = true
          and private.is_campaign_member(m.campaign_id)
        )
      )
  )
);
