-- Keep unauthenticated clients read-only at the table-grant layer.
-- Existing RLS policies still determine which rows anon may read; write
-- policies remain available to authenticated users and trusted server roles.
-- This does not change any data, policies, or grants for authenticated/service_role.
revoke insert, update, delete, references, trigger, truncate
  on all tables in schema public
  from anon;
