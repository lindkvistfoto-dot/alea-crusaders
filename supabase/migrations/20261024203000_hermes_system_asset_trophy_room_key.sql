-- Keep the existing target-key grammar and permit only the approved opaque system asset.
alter table public.hermes_jobs
  drop constraint if exists hermes_jobs_target_key_check;

alter table public.hermes_jobs
  add constraint hermes_jobs_target_key_check
    check (
      target_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or (kind = 'system-asset' and target_key = 'arcane-trophy-room-v2.2')
    );
