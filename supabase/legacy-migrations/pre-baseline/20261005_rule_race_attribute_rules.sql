create table if not exists public.rule_race_attributes (
  race_id text not null references public.rule_races(id) on delete cascade,
  attribute_key text not null,
  roll_formula text,
  typical_value integer,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (race_id, attribute_key),
  constraint rule_race_attributes_attribute_key_check
    check (attribute_key in ('STY','FYS','STO','SMI','INT','PSY','KAR')),
  constraint rule_race_attributes_typical_value_check
    check (typical_value is null or typical_value between 0 and 99)
);

alter table public.rule_race_attributes enable row level security;

revoke all on table public.rule_race_attributes from anon;
grant select, insert, update, delete on table public.rule_race_attributes to authenticated;
grant all on table public.rule_race_attributes to service_role;

drop policy if exists "rule_race_attributes_read" on public.rule_race_attributes;
create policy "rule_race_attributes_read"
on public.rule_race_attributes
for select
to authenticated
using (true);

drop policy if exists "rule_race_attributes_insert_admin" on public.rule_race_attributes;
create policy "rule_race_attributes_insert_admin"
on public.rule_race_attributes
for insert
to authenticated
with check (private.is_admin());

drop policy if exists "rule_race_attributes_update_admin" on public.rule_race_attributes;
create policy "rule_race_attributes_update_admin"
on public.rule_race_attributes
for update
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "rule_race_attributes_delete_admin" on public.rule_race_attributes;
create policy "rule_race_attributes_delete_admin"
on public.rule_race_attributes
for delete
to authenticated
using (private.is_admin());

insert into public.rule_race_attributes (race_id, attribute_key, sort_order)
select r.id, a.attribute_key, a.sort_order
from public.rule_races r
cross join (
  values
    ('STY',10),
    ('FYS',20),
    ('STO',30),
    ('SMI',40),
    ('INT',50),
    ('PSY',60),
    ('KAR',70)
) as a(attribute_key,sort_order)
on conflict (race_id,attribute_key) do nothing;
