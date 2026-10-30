-- Alea Crusaders
-- Allow map polygons to exist before they are linked to a campaign location.
-- Unlinked polygons remain admin-only until a location is assigned.

alter table public.campaign_map_areas
  alter column location_id drop not null;
