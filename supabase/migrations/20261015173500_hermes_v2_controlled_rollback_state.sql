-- HERMES 2.0 controlled rollback: preserve immutable assets but allow a verified job to be deactivated.
alter table public.hermes_jobs drop constraint if exists hermes_jobs_status_check;
alter table public.hermes_jobs add constraint hermes_jobs_status_check
 check (status in ('staged','awaiting_archive','archived','verified','active','failed','rolled_back'));
