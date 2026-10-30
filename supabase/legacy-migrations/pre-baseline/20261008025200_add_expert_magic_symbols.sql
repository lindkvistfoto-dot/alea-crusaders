-- Drakar och Demoner Expert – Magiboken: Symbolism
create table if not exists public.rule_magic_symbols (
  id uuid primary key default gen_random_uuid(),
  symbol_key text not null unique,
  name text not null,
  school_value integer not null check (school_value >= 0),
  range_text text not null default '',
  duration_text text not null default '',
  notes text not null default '',
  source_label text not null default 'Drakar och Demoner Expert – Magiboken',
  canonical_expert boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.rule_magic_symbols enable row level security;
drop policy if exists "rule_magic_symbols_read" on public.rule_magic_symbols;
create policy "rule_magic_symbols_read" on public.rule_magic_symbols for select to anon, authenticated using (true);
grant select on public.rule_magic_symbols to anon, authenticated;

insert into public.rule_magic_symbols(symbol_key,name,school_value,range_text,duration_text,notes,sort_order) values
('osakerhet','OSÄKERHET',3,'Beröring','Sx1 timmar','Magiboken s.12',10),
('stopp','STOPP',4,'Beröring','Omedelbar','Magiboken s.12',20),
('lockelse','LOCKELSE',5,'Beröring','Omedelbar','Magiboken s.12',30),
('vanskap','VÄNSKAP',5,'Beröring','Omedelbar','Magiboken s.13',40),
('blindhet','BLINDHET',13,'Beröring','Omedelbar','Magiboken s.13',50),
('glomska','GLÖMSKA',13,'Beröring','Omedelbar','Magiboken s.13',60)
on conflict(symbol_key) do update set
 name=excluded.name, school_value=excluded.school_value, range_text=excluded.range_text,
 duration_text=excluded.duration_text, notes=excluded.notes, sort_order=excluded.sort_order;
