-- ARCANE CHRONICLES #276: session persistence foundation.
-- Closed by default pending audited GM-authorized API integration.
create table if not exists public.campaign_sessions (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete restrict,
 session_number integer not null check (session_number > 0),
 session_date date not null,
 status text not null default 'active' check (status in ('active','completed')),
 started_at timestamptz not null default now(),
 ended_at timestamptz,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint campaign_sessions_number_unique unique (campaign_id, session_number),
 constraint campaign_sessions_completion_consistent check ((status='active' and ended_at is null) or (status='completed' and ended_at is not null))
);
create unique index if not exists campaign_sessions_one_active_per_campaign on public.campaign_sessions(campaign_id) where status='active';
create index if not exists campaign_sessions_campaign_date on public.campaign_sessions(campaign_id,session_date desc);
alter table public.campaign_sessions enable row level security;
revoke all on public.campaign_sessions from anon, authenticated;
comment on table public.campaign_sessions is 'ARCANE CHRONICLES session ledger. RLS closed pending GM-authorized API; separate from in-world campaign_day_state.';
