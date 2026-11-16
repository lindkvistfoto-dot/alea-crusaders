-- Require explicit table grants for newly created public tables. Existing
-- application CRUD grants remain intact; remove only anonymous access and
-- non-API DDL privileges that RLS cannot protect.
revoke all privileges on all tables in schema public from anon;
grant select on table public.rule_magic_symbols to anon;

revoke references, trigger, truncate
  on all tables in schema public
  from authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated, service_role;
