-- Service-role publisher needs explicit grants for this SQL-created table.
-- Retain RLS for authenticated users; this role already possesses service credentials.
grant select, update on table public.global_npcs to service_role;
