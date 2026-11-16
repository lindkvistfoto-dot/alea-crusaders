create table if not exists public.rule_professions (
  id text primary key,
  name text not null unique,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rule_professions enable row level security;

revoke all on table public.rule_professions from anon;
grant select, insert, update, delete on table public.rule_professions to authenticated;
grant all on table public.rule_professions to service_role;

create policy "rule_professions_read"
on public.rule_professions
for select
to authenticated
using (true);

create policy "rule_professions_insert_admin"
on public.rule_professions
for insert
to authenticated
with check (private.is_admin());

create policy "rule_professions_update_admin"
on public.rule_professions
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "rule_professions_delete_admin"
on public.rule_professions
for delete
to authenticated
using (private.is_admin());

insert into public.rule_professions (id, name, sort_order) values
  ('gycklare', 'Gycklare', 10),
  ('jagare', 'Jägare', 20),
  ('krigare', 'Krigare', 30),
  ('kopman', 'Köpman', 40),
  ('lard_man', 'Lärd man', 50),
  ('munk', 'Munk', 60),
  ('pirat_sjofarare', 'Pirat/Sjöfarare', 70),
  ('riddare', 'Riddare', 80),
  ('stratrovare', 'Stråtrövare', 90),
  ('tjuv', 'Tjuv', 100),
  ('trollkarl', 'Trollkarl', 110)
on conflict (id) do update
set name = excluded.name,
    sort_order = excluded.sort_order;
