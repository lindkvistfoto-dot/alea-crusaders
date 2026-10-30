create table if not exists public.rule_races (
  id text primary key,
  name text not null unique,
  category text not null default '',
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rule_races enable row level security;

revoke all on table public.rule_races from anon;
grant select, insert, update, delete on table public.rule_races to authenticated;
grant all on table public.rule_races to service_role;

create policy "rule_races_read"
on public.rule_races
for select
to authenticated
using (true);

create policy "rule_races_insert_admin"
on public.rule_races
for insert
to authenticated
with check (private.is_admin());

create policy "rule_races_update_admin"
on public.rule_races
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

create policy "rule_races_delete_admin"
on public.rule_races
for delete
to authenticated
using (private.is_admin());

insert into public.rule_races (id, name, category, sort_order) values
  ('manniska', 'Människa', '', 10),
  ('anka', 'Anka', '', 20),
  ('halvlangdsman', 'Halvlängdsman', '', 30),
  ('kattman', 'Kattman', '', 40),
  ('vargman', 'Vargman', '', 50),
  ('svanman', 'Svanman', '', 60),
  ('kentaur', 'Kentaur', '', 70),
  ('minotaur', 'Minotaur', '', 80),
  ('reptilman', 'Reptilman', '', 90),
  ('karkion', 'Karkion', '', 100),
  ('skogsalv', 'Skogsalv', 'Älvfolk', 110),
  ('graalv', 'Gråalv', 'Älvfolk', 120),
  ('silveralv', 'Silveralv', 'Älvfolk', 130),
  ('grottalv', 'Grottalv', 'Älvfolk', 140),
  ('dvarg', 'Dvärg', 'Stenfolk', 150),
  ('cyklop', 'Cyklop', 'Stenfolk', 160),
  ('jatte', 'Jätte', 'Stenfolk', 170),
  ('orch', 'Orch', 'Svartfolk', 180),
  ('rese', 'Rese', 'Svartfolk', 190),
  ('svartalf', 'Svartalf', 'Svartfolk', 200),
  ('svartnisse', 'Svartnisse', 'Svartfolk', 210)
on conflict (id) do update
set name = excluded.name,
    category = excluded.category,
    sort_order = excluded.sort_order;
