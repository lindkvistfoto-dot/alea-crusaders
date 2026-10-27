-- The cleanup report is SECURITY INVOKER and checks references in the honors tables.
-- Keep those base-table reads restricted to the trusted service_role worker.
grant select on public.honor_definitions, public.honor_relief_variants to service_role;
