-- HERMES 2.1 trusted GitHub Actions publisher (non-destructive, additive).
-- Human-initiated jobs continue requiring a real auth.users foreign key.
-- CI-initiated jobs identify their GitHub Actions run; they do not impersonate a user.
ALTER TABLE public.hermes_jobs
 ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'admin',
 ADD COLUMN IF NOT EXISTS github_run_id text;
ALTER TABLE public.hermes_jobs ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.hermes_jobs DROP CONSTRAINT IF EXISTS hermes_jobs_origin_actor_check;
ALTER TABLE public.hermes_jobs ADD CONSTRAINT hermes_jobs_origin_actor_check
 CHECK (
  (origin='admin' AND created_by IS NOT NULL AND github_run_id IS NULL)
  OR
  (origin='github_actions' AND created_by IS NULL
   AND github_run_id ~ '^[0-9]{6,20}$')
 );
