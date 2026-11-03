create table if not exists public.olympia_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  description text not null default '' check (char_length(description) <= 4000),
  status text not null default 'idea_bank'
    check (status in ('idea_bank', 'to_process', 'in_olympia', 'done')),
  active_pr_number integer check (active_pr_number is null or active_pr_number > 0),
  historical_prs jsonb not null default '[]'::jsonb check (jsonb_typeof(historical_prs) = 'array'),
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history) = 'array'),
  import_source text,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint olympia_ideas_active_pr_status_check check (
    (status in ('in_olympia', 'done') and active_pr_number is not null)
    or (status in ('idea_bank', 'to_process') and active_pr_number is null)
  ),
  constraint olympia_ideas_done_timestamp_check check (
    (status = 'done' and completed_at is not null) or (status <> 'done' and completed_at is null)
  )
);

comment on table public.olympia_ideas is
  'Persistent OLYMPIA 2.0 idea bank and historical PR register. GitHub PRs are never changed by this table.';
comment on column public.olympia_ideas.historical_prs is
  'Reviewed historical PR references and audit classifications; hidden=true only filters the OLYMPIA UI.';
comment on column public.olympia_ideas.history is
  'Append-only application audit events for creation, edits, status changes, PR links and imports.';

create index if not exists olympia_ideas_status_updated_idx
  on public.olympia_ideas (status, updated_at desc);
create index if not exists olympia_ideas_historical_prs_gin_idx
  on public.olympia_ideas using gin (historical_prs jsonb_path_ops);

alter table public.olympia_ideas enable row level security;
revoke all on public.olympia_ideas from anon;
grant select, insert, update on public.olympia_ideas to authenticated;
grant all on public.olympia_ideas to service_role;

drop policy if exists olympia_ideas_admin_manage on public.olympia_ideas;
create policy olympia_ideas_admin_manage on public.olympia_ideas
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
