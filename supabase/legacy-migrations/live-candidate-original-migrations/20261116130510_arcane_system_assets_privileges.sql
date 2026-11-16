-- Keep client access read-only; HERMES server-side writers need DML through
-- service_role. RLS and its published-read policy remain enabled and intact.
revoke all privileges on table public.arcane_system_assets from public, anon;

revoke insert, update, delete, truncate, references, trigger
  on table public.arcane_system_assets from authenticated;
grant select on table public.arcane_system_assets to authenticated;

revoke truncate, references, trigger
  on table public.arcane_system_assets from service_role;
grant select, insert, update, delete
  on table public.arcane_system_assets to service_role;
