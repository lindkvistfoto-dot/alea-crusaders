-- ARCANE HONORS: scoped, auditable honors.
create table if not exists public.honor_definitions (
 id uuid primary key default gen_random_uuid(),
 name text not null check (length(trim(name)) > 0),
 type text not null check (type in ('adventure','campaign','achievement','honor')),
 description text not null default '',
 requirement_text text not null default '',
 visibility text not null default 'public' check (visibility in ('public','silhouette','secret')),
 grant_mode text not null default 'manual' check (grant_mode in ('manual','automatic','both')),
 status text not null default 'draft' check (status in ('draft','active','inactive')),
 campaign_id uuid references public.campaigns(id) on delete restrict,
 adventure_id text,
 image_asset_id text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.honor_grants (
 id uuid primary key default gen_random_uuid(),
 honor_id uuid not null references public.honor_definitions(id) on delete restrict,
 character_id uuid not null references public.characters(id) on delete restrict,
 granted_by uuid not null references auth.users(id),
 granted_at timestamptz not null default now(),
 reason text,
 source_event_id text,
 revoked_at timestamptz,
 revoked_by uuid references auth.users(id),
 revocation_reason text,
 check ((revoked_at is null and revoked_by is null) or (revoked_at is not null and revoked_by is not null))
);
create unique index if not exists honor_one_active_grant on public.honor_grants(honor_id,character_id) where revoked_at is null;
create unique index if not exists honor_event_idempotency on public.honor_grants(honor_id,character_id,source_event_id) where source_event_id is not null;
create index if not exists honor_grants_character on public.honor_grants(character_id);
alter table public.honor_definitions enable row level security;
alter table public.honor_grants enable row level security;
-- Start closed. Privileged writes and player-safe projections require audited server endpoints.
revoke all on public.honor_definitions from anon, authenticated;
revoke all on public.honor_grants from anon, authenticated;
comment on table public.honor_definitions is 'ARCANE HONORS. RLS closed until GM authorization and spoiler-safe projections are implemented.';
