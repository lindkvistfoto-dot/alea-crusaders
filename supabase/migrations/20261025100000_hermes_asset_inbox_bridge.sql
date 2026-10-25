-- HERMES Inbox Bridge: durable, admin-owned jobs for symbol artwork.
-- Original bytes remain in the existing private alea-hermes-source bucket until archived.
create table if not exists public.hermes_asset_jobs (
  id uuid primary key,
  idempotency_key uuid not null unique,
  target_type text not null check (target_type = 'symbol'),
  target_id uuid not null,
  target_key text not null check (target_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  image_type text not null check (image_type in ('icon','effect','cutout','illustration','illustration-wide')),
  source_bucket text not null default 'alea-hermes-source' check (source_bucket = 'alea-hermes-source'),
  source_path text not null unique,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_bytes integer not null check (source_bytes between 1 and 8388608),
  previous_path text,
  state text not null default 'received' check (state in ('received','inboxed','archived','publishing','published','failed')),
  attempts integer not null default 0 check (attempts between 0 and 12),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  inbox_drive_file_id text,
  archive_drive_file_id text,
  output_path text,
  app_sha256 text check (app_sha256 is null or app_sha256 ~ '^[a-f0-9]{64}$'),
  error_code text,
  requested_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (target_type,target_id,image_type,source_sha256)
);

create index if not exists hermes_asset_jobs_pending_idx
  on public.hermes_asset_jobs(next_attempt_at,created_at)
  where state <> 'published' and attempts < 12;
create index if not exists hermes_asset_jobs_admin_recent_idx
  on public.hermes_asset_jobs(created_at desc);

alter table public.hermes_asset_jobs enable row level security;
revoke all on public.hermes_asset_jobs from anon,authenticated;
grant select on public.hermes_asset_jobs to authenticated;
grant select,insert,update on public.hermes_asset_jobs to service_role;
drop policy if exists hermes_asset_jobs_admin_read on public.hermes_asset_jobs;
create policy hermes_asset_jobs_admin_read on public.hermes_asset_jobs
  for select to authenticated using ((select private.is_admin()));

-- Reuse the existing private originals bucket. Widen only accepted source MIME types;
-- authorization remains server-side and bucket privacy is unchanged.
update storage.buckets
set allowed_mime_types = array['image/png','image/jpeg','image/webp'],
    file_size_limit = 8388608,
    public = false
where id = 'alea-hermes-source';

-- Atomic worker claim; SECURITY INVOKER keeps service_role privileges and RLS semantics.
create or replace function public.hermes_claim_asset_jobs(batch_size integer default 3)
returns setof public.hermes_asset_jobs
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'service role required';
  end if;
  return query
  with candidates as (
    select j.id
    from public.hermes_asset_jobs j
    where j.attempts < 12
      and j.next_attempt_at <= now()
      and (j.lease_until is null or j.lease_until < now())
      and j.state <> 'published'
    order by j.created_at
    for update skip locked
    limit greatest(1, least(batch_size, 10))
  )
  update public.hermes_asset_jobs j
  set lease_token = gen_random_uuid(),
      lease_until = now() + interval '10 minutes',
      attempts = j.attempts + 1,
      state = case
        when j.archive_drive_file_id is not null then 'archived'
        when j.inbox_drive_file_id is not null then 'inboxed'
        else 'received'
      end,
      updated_at = now()
  from candidates c
  where j.id = c.id
  returning j.*;
end;
$$;

revoke all on function public.hermes_claim_asset_jobs(integer) from public,anon,authenticated;
grant execute on function public.hermes_claim_asset_jobs(integer) to service_role;

comment on table public.hermes_asset_jobs is
  'HERMES durable symbol-art intake. Private original retained; pointer activation follows verified Drive archive and WebP readback.';
