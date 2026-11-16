-- HERMES CORE's trusted Actions publisher only changes the selected image pointer.
-- Preserve existing RLS, triggers, browser grants and all unrelated honor fields.
grant update (image_asset_id) on public.honor_definitions to service_role;
grant update (image_asset_id) on public.honor_relief_variants to service_role;
