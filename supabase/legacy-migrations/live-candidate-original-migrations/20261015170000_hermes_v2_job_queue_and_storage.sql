-- HERMES 2.0 (deployed 2026-10-15): additive jobs, event log and immutable media buckets.
-- Supabase Edge Function has service-role write access; clients receive admin-only SELECT.
create table if not exists public.hermes_jobs (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('spell','symbol')),
 target_key text not null check (target_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 source_sha256 text not null check (source_sha256 ~ '^[0-9a-f]{64}$'),
 app_sha256 text not null check (app_sha256 ~ '^[0-9a-f]{64}$'),
 source_path text not null,
 app_path text not null,
 source_bytes integer not null check (source_bytes between 1 and 8388608),
 app_bytes integer not null check (app_bytes between 1 and 524288),
 status text not null default 'staged' check (status in ('staged','awaiting_archive','archived','verified','active','failed')),
 github_blob_sha text,
 github_commit_sha text,
 previous_icon_path text,
 error_code text,
 error_message text,
 attempts integer not null default 0 check (attempts >= 0),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 activated_at timestamptz,
 unique(kind,target_key,source_sha256)
);
create index if not exists hermes_jobs_recent_idx on public.hermes_jobs(created_at desc);
create table if not exists public.hermes_job_events (
 id bigint generated always as identity primary key,
 job_id uuid not null references public.hermes_jobs(id) on delete cascade,
 state text not null,
 message text,
 created_at timestamptz not null default now()
);
create index if not exists hermes_job_events_job_idx on public.hermes_job_events(job_id,created_at);
alter table public.hermes_jobs enable row level security;
alter table public.hermes_job_events enable row level security;
revoke all on public.hermes_jobs from anon,authenticated;
revoke all on public.hermes_job_events from anon,authenticated;
grant select on public.hermes_jobs to authenticated;
grant select on public.hermes_job_events to authenticated;
drop policy if exists hermes_jobs_admin_read on public.hermes_jobs;
create policy hermes_jobs_admin_read on public.hermes_jobs for select to authenticated using ((select private.is_admin()));
drop policy if exists hermes_events_admin_read on public.hermes_job_events;
create policy hermes_events_admin_read on public.hermes_job_events for select to authenticated using ((select private.is_admin()));
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values
 ('alea-hermes-source','alea-hermes-source',false,8388608,array['image/png']),
 ('alea-hermes-public','alea-hermes-public',true,524288,array['image/webp'])
on conflict(id) do nothing;
comment on table public.hermes_jobs is 'HERMES 2.0 retryable media jobs; service-role writes only. Existing icon paths remain live until verified.';
