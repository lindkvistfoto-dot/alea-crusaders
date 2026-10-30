alter table public.rule_armor_types
  add column if not exists weight_code text,
  add column if not exists price_per_bep numeric,
  add column if not exists source_label text not null default 'Alea',
  add column if not exists canonical_expert boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='rule_armor_types_weight_code_check'
      and conrelid='public.rule_armor_types'::regclass
  ) then
    alter table public.rule_armor_types
      add constraint rule_armor_types_weight_code_check
      check (weight_code is null or weight_code in ('A','B','C','D','E','F','G','H','J','K'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='rule_armor_types_price_per_bep_check'
      and conrelid='public.rule_armor_types'::regclass
  ) then
    alter table public.rule_armor_types
      add constraint rule_armor_types_price_per_bep_check
      check (price_per_bep is null or price_per_bep >= 0);
  end if;
end $$;

update public.rule_armor_types set
  name='Tjockt tyg', absorption=1, bep=2, weight_code='A',
  price_per_bep=20, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 1, viktkod A. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=10, updated_at=now()
where type_key='padded';

update public.rule_armor_types set
  name='Läder', absorption=2, bep=3, weight_code='C',
  price_per_bep=25, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 2, viktkod C. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=20, updated_at=now()
where type_key='soft_leather';

update public.rule_armor_types set
  name='Nitläder', absorption=3, bep=5, weight_code='E',
  price_per_bep=70, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 3, viktkod E. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=30, updated_at=now()
where type_key='studded_leather';

insert into public.rule_armor_types
(type_key,name,category,absorption,bep,description,sort_order,weight_code,price_per_bep,source_label,canonical_expert)
values
('light_scale','Lätt fjällpansar','metal',4,6,
 'Expert: helkroppsrustning. ABS 4, viktkod F. BEP-värdet här motsvarar bärare med STO 9-12.',
 40,'F',150,'Expert E51-52',true)
on conflict (type_key) do update set
  name=excluded.name, category=excluded.category, absorption=excluded.absorption,
  bep=excluded.bep, description=excluded.description, sort_order=excluded.sort_order,
  weight_code=excluded.weight_code, price_per_bep=excluded.price_per_bep,
  source_label=excluded.source_label, canonical_expert=excluded.canonical_expert,
  updated_at=now();

update public.rule_armor_types set
  name='Fjällpansar', absorption=5, bep=7, weight_code='G',
  price_per_bep=150, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 5, viktkod G. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=50, updated_at=now()
where type_key='scale_lamellar';

update public.rule_armor_types set
  name='Ringbrynja', absorption=6, bep=8, weight_code='H',
  price_per_bep=175, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 6, viktkod H. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=60, updated_at=now()
where type_key='chainmail';

update public.rule_armor_types set
  name='Förstärkt ringbrynja', absorption=7, bep=9, weight_code='J',
  price_per_bep=175, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 7, viktkod J. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=70, updated_at=now()
where type_key='reinforced_chainmail';

update public.rule_armor_types set
  name='Helrustning', absorption=8, bep=10, weight_code='K',
  price_per_bep=200, source_label='Expert E51-52', canonical_expert=true,
  description='Expert: helkroppsrustning. ABS 8, viktkod K. BEP-värdet här motsvarar bärare med STO 9-12.',
  sort_order=80, updated_at=now()
where type_key='plate';

update public.rule_armor_types set
  source_label='Alea-tillägg', canonical_expert=false, weight_code=null,
  price_per_bep=null, sort_order=90, updated_at=now()
where type_key='hard_leather';

create table if not exists public.rule_shields (
  id uuid primary key default gen_random_uuid(),
  shield_key text not null unique,
  name text not null unique,
  size_class text not null check (size_class in ('small','medium','large')),
  skill_id text not null default 'skoldar' references public.rule_skills(id) on update cascade on delete restrict,
  absorption integer null check (absorption is null or absorption >= 0),
  bep numeric null check (bep is null or bep >= 0),
  bv integer null check (bv is null or bv >= 0),
  price numeric null check (price is null or price >= 0),
  projectile_block_min integer not null default 1,
  projectile_block_max integer not null,
  passive_coverage text not null default '',
  can_parry_thrown boolean not null default true,
  destruction_chance_per_excess numeric not null default 0.05
    check (destruction_chance_per_excess >= 0 and destruction_chance_per_excess <= 1),
  source_label text not null default 'Expert E55',
  notes text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rule_shields_projectile_range_check check (
    projectile_block_min >= 1
    and projectile_block_max <= 20
    and projectile_block_min <= projectile_block_max
  )
);

alter table public.rule_shields enable row level security;

drop policy if exists rule_shields_select on public.rule_shields;
create policy rule_shields_select on public.rule_shields
for select to authenticated using (true);

drop policy if exists rule_shields_insert on public.rule_shields;
create policy rule_shields_insert on public.rule_shields
for insert to authenticated
with check ((select private.is_admin()));

drop policy if exists rule_shields_update on public.rule_shields;
create policy rule_shields_update on public.rule_shields
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists rule_shields_delete on public.rule_shields;
create policy rule_shields_delete on public.rule_shields
for delete to authenticated
using ((select private.is_admin()));

grant select, insert, update, delete on public.rule_shields to authenticated;
create index if not exists rule_shields_skill_id_idx on public.rule_shields(skill_id);

insert into public.rule_shields
(shield_key,name,size_class,skill_id,projectile_block_min,projectile_block_max,
 passive_coverage,can_parry_thrown,destruction_chance_per_excess,source_label,notes,sort_order)
values
('small','Liten sköld','small','skoldar',1,2,
 'Sköldarm',true,0.05,'Expert E55',
 'Expert: passivt skydd för sköldarmen. Projektil träffar skölden på 1-2 med 1T20 om angreppet kommer från sköldsidan.',10),
('medium','Medelstor sköld','medium','skoldar',1,4,
 'Sköldarm + bröstkorg',true,0.05,'Expert E55',
 'Expert: passivt skydd för sköldarm och bröstkorg. Projektil träffar skölden på 1-4 med 1T20 om angreppet kommer från sköldsidan.',20),
('large','Stor sköld','large','skoldar',1,6,
 'Sköldarm + mage + bröstkorg',true,0.05,'Expert E55',
 'Expert: passivt skydd för sköldarm, mage och bröstkorg. Projektil träffar skölden på 1-6 med 1T20 om angreppet kommer från sköldsidan.',30)
on conflict (shield_key) do update set
  name=excluded.name,
  size_class=excluded.size_class,
  skill_id=excluded.skill_id,
  projectile_block_min=excluded.projectile_block_min,
  projectile_block_max=excluded.projectile_block_max,
  passive_coverage=excluded.passive_coverage,
  can_parry_thrown=excluded.can_parry_thrown,
  destruction_chance_per_excess=excluded.destruction_chance_per_excess,
  source_label=excluded.source_label,
  notes=excluded.notes,
  sort_order=excluded.sort_order,
  updated_at=now();
