-- Match the existing column-scoped icon/illustration publisher grants.
-- Backend only: no authenticated/anon grants and no RLS policy changes.
grant update (illustration_wide_path) on table public.rule_skills to service_role;
