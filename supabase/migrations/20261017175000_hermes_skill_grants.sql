-- HERMES's trusted service role must read skill ids and previous icons and update only icon_path.
-- Preserve other skill attributes and illustration_path as protected by existing grants.
grant select on table public.rule_skills to service_role;
grant update (icon_path) on table public.rule_skills to service_role;
