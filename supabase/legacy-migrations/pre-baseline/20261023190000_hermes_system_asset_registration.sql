-- HERMES can register new validated system-asset targets without a code allowlist.
-- Keep public and authenticated roles read-only and preserve existing RLS.
grant insert (id, asset_key, label) on public.arcane_system_assets to service_role;
