-- ARCANE HONORS: additive relief variants, no existing grants modified.
-- RLS is enabled without public policies until the existing GM authorization
-- functions/policies are reviewed and integrated in a subsequent migration.
create table if not exists public.honor_relief_variants (
  id uuid primary key default gen_random_uuid(),
  honor_id uuid not null references public.honor_definitions(id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  material text not null check (material in ('enamel','metal','wood','stone','other')),
  image_asset_id text not null check (length(btrim(image_asset_id)) > 0),
  status text not null default 'draft' check (status in ('draft','active','archived')),
  allow_overhang boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (honor_id, name)
);
create index if not exists honor_relief_variants_honor_id_idx
  on public.honor_relief_variants (honor_id);
alter table public.honor_relief_variants enable row level security;
revoke all on public.honor_relief_variants from anon, authenticated;
-- A variant is not published by itself: selected preview/published IDs are
-- deliberately deferred until permissions and existing Honors UI are wired.
