-- HERMES 2.0: grant only server-role DML required for immutable media jobs and activation.
-- The application login and public RLS policies are unchanged.
GRANT SELECT, UPDATE ON TABLE public.rule_magic_symbols TO service_role;
GRANT SELECT, UPDATE ON TABLE public.rule_spells TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.hermes_jobs TO service_role;
GRANT SELECT, INSERT ON TABLE public.hermes_job_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.hermes_job_events_id_seq TO service_role;
