create table if not exists public.rule_armor_types (
  id uuid primary key default gen_random_uuid(),
  type_key text not null unique,
  name text not null,
  category text not null check (category in ('cloth','leather','metal')),
  absorption integer not null check (absorption >= 0),
  bep integer not null check (bep >= 0),
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.rule_armor_materials (
  id uuid primary key default gen_random_uuid(),
  material_key text not null unique,
  name text not null,
  abs_modifier integer not null default 0,
  bep_override integer null check (bep_override is null or bep_override >= 0),
  allowed_categories text[] not null default array['cloth','leather','metal']::text[],
  base_type_key_override text null,
  blocks_magic_override boolean null,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rule_armor_types enable row level security;
alter table public.rule_armor_materials enable row level security;

drop policy if exists rule_armor_types_select on public.rule_armor_types;
create policy rule_armor_types_select on public.rule_armor_types for select to authenticated using (true);

drop policy if exists rule_armor_types_insert on public.rule_armor_types;
create policy rule_armor_types_insert on public.rule_armor_types for insert to authenticated with check ((select private.is_admin()));

drop policy if exists rule_armor_types_update on public.rule_armor_types;
create policy rule_armor_types_update on public.rule_armor_types for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists rule_armor_types_delete on public.rule_armor_types;
create policy rule_armor_types_delete on public.rule_armor_types for delete to authenticated using ((select private.is_admin()));

drop policy if exists rule_armor_materials_select on public.rule_armor_materials;
create policy rule_armor_materials_select on public.rule_armor_materials for select to authenticated using (true);

drop policy if exists rule_armor_materials_insert on public.rule_armor_materials;
create policy rule_armor_materials_insert on public.rule_armor_materials for insert to authenticated with check ((select private.is_admin()));

drop policy if exists rule_armor_materials_update on public.rule_armor_materials;
create policy rule_armor_materials_update on public.rule_armor_materials for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists rule_armor_materials_delete on public.rule_armor_materials;
create policy rule_armor_materials_delete on public.rule_armor_materials for delete to authenticated using ((select private.is_admin()));

grant select, insert, update, delete on public.rule_armor_types to authenticated;
grant select, insert, update, delete on public.rule_armor_materials to authenticated;

insert into public.rule_armor_types
(type_key,name,category,absorption,bep,description,sort_order)
values
('padded','Tjockt tyg / Vadderat','cloth',1,1,'Tygharnesk / vadderad tunika.',10),
('soft_leather','Mjukt läder','leather',2,2,'Vanlig läderrustning.',20),
('studded_leather','Nitläder','leather',3,3,'Läder förstärkt med metallnitar.',30),
('hard_leather','Härdat läder','leather',4,4,'Styvt, kokt läder.',40),
('chainmail','Ringbrynja','metal',5,7,'Metallskydd av länkade järnringar.',50),
('reinforced_chainmail','Förstärkt ringbrynja','metal',6,8,'Tjockare ringbrynja eller ringbrynja med extra foder.',60),
('scale_lamellar','Fjällpansar / Lamell','metal',6,9,'Överlappande metallplattor fastsydda på tyg eller läder.',70),
('plate','Helrustning / Plåt','metal',8,12,'Det tyngsta skyddet av smidda stålplåtar.',80)
on conflict (type_key) do update set
name=excluded.name,category=excluded.category,absorption=excluded.absorption,bep=excluded.bep,
description=excluded.description,sort_order=excluded.sort_order,updated_at=now();

insert into public.rule_armor_materials
(material_key,name,abs_modifier,bep_override,allowed_categories,base_type_key_override,blocks_magic_override,description,sort_order)
values
('standard','Standard',0,null,array['cloth','leather','metal']::text[],null,null,'Standardmaterial. Metallrustning kan påverka magi enligt reglerna.',10),
('bronze','Brons',-1,null,array['metal']::text[],null,false,'Metallrustning i brons: 1 lägre Abs än standard, men blockerar inte magi.',20),
('mithril','Mithril',0,0,array['metal']::text[],null,false,'Sällsynt dvärgametall. Samma Abs som standard, räknas som viktlös/extremt lätt och blockerar inte magi.',30),
('dragonhide','Drakskinn',3,null,array['leather']::text[],'hard_leather',false,'Drakskinn använder Härdat läder som grund, +3 Abs, samma BEP som Härdat läder och blockerar inte magi.',40)
on conflict (material_key) do update set
name=excluded.name,abs_modifier=excluded.abs_modifier,bep_override=excluded.bep_override,
allowed_categories=excluded.allowed_categories,base_type_key_override=excluded.base_type_key_override,
blocks_magic_override=excluded.blocks_magic_override,description=excluded.description,
sort_order=excluded.sort_order,updated_at=now();
