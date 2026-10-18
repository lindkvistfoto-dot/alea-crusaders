-- Add only the independent WIDE media kind; no data or access policies change.
alter table public.hermes_jobs drop constraint if exists hermes_jobs_kind_check;
alter table public.hermes_jobs add constraint hermes_jobs_kind_check
 check (kind in ('spell','symbol','skill','skill-illustration','skill-illustration-wide'));
