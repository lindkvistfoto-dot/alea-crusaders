-- Let the trusted HERMES CORE publisher update only the image reference fields
-- it owns. Keep the target tables readable for verification and cleanup.
revoke all privileges on table public.honor_definitions from service_role;
grant select on table public.honor_definitions to service_role;
grant update (image_asset_id, image_revision)
  on table public.honor_definitions to service_role;

revoke all privileges on table public.honor_relief_variants from service_role;
grant select on table public.honor_relief_variants to service_role;
grant insert (honor_id, name, material, image_asset_id, status, created_by)
  on table public.honor_relief_variants to service_role;
grant update (image_asset_id, updated_at)
  on table public.honor_relief_variants to service_role;
