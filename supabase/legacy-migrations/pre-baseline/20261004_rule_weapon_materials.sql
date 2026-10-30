alter table public.rule_weapons
  add column if not exists tags text[] not null default '{}'::text[];

create table if not exists public.rule_weapon_materials (
  id uuid primary key default gen_random_uuid(),
  material_key text not null unique,
  name text not null,
  is_default boolean not null default false,
  allowed_any_tags text[] not null default '{}'::text[],
  rules jsonb not null default '[]'::jsonb,
  description text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists rule_weapon_materials_one_default
  on public.rule_weapon_materials (is_default)
  where is_default = true;

alter table public.rule_weapon_materials enable row level security;

drop policy if exists rule_weapon_materials_select on public.rule_weapon_materials;
create policy rule_weapon_materials_select on public.rule_weapon_materials
for select to authenticated using (true);

drop policy if exists rule_weapon_materials_insert on public.rule_weapon_materials;
create policy rule_weapon_materials_insert on public.rule_weapon_materials
for insert to authenticated with check ((select private.is_admin()));

drop policy if exists rule_weapon_materials_update on public.rule_weapon_materials;
create policy rule_weapon_materials_update on public.rule_weapon_materials
for update to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

drop policy if exists rule_weapon_materials_delete on public.rule_weapon_materials;
create policy rule_weapon_materials_delete on public.rule_weapon_materials
for delete to authenticated using ((select private.is_admin()));

grant select, insert, update, delete on public.rule_weapon_materials to authenticated;

insert into public.rule_weapon_materials
(material_key,name,is_default,allowed_any_tags,rules,description,sort_order)
values
('standard','Standard',true,'{}'::text[],'[]'::jsonb,'Standardmaterial. Vapnet använder grundvärdena utan materialmodifiering.',10),
('wood','Trä',false,array['club','staff','spear','arrow','bolt']::text[],
 '[{"field":"damage","op":"add","value":-3,"require_any_tags":["spear_point","arrow_point","bolt_point"]}]'::jsonb,
 'Trä används normalt till klubbor och påkar. Primitiva träspetsar till spjut och pilar ger 3 lägre skada.',20),
('stone','Sten',false,array['dagger','club','spear','arrow','bolt']::text[],
 '[{"field":"damage","op":"add","value":-2,"require_any_tags":["dagger","spear","arrow_point","bolt_point"],"exclude_any_tags":["club"]},{"field":"bv","op":"add","value":-4,"require_any_tags":["dagger"]}]'::jsonb,
 'Stenvapen: dolk, stridsklubba, spjut, pil och skäkta. Alla utom stridsklubba får 2 lägre skada. Stendolk får dessutom 4 lägre BV.',30),
('teeth','Tänder',false,array['spear','arrow']::text[],
 '[{"field":"damage","op":"add","value":-2,"require_any_tags":["spear_point","arrow_point"]}]'::jsonb,
 'Spetsar till spjut och pilar kan göras av rovdjurständer. Skadan minskas med 2.',40),
('bronze','Brons',false,'{}'::text[],
 '[{"field":"damage","op":"add","value":-1,"require_any_tags":["edged"]},{"field":"bv","op":"add","value":-2,"require_any_tags":["sword","dagger"]},{"field":"price","op":"multiply","value":0.8}]'::jsonb,
 'Alla vapen kan tillverkas av brons. Skärande egg ger 1 lägre skada. Svärd och dolkar får 2 lägre BV. Bronsvapen kostar 80 % av järnpriset.',50),
('mithril','Mithril',false,'{}'::text[],
 '[{"field":"damage","op":"add","value":1,"require_any_tags":["edged"]},{"field":"bv","op":"add","value":2,"require_any_tags":["sword","dagger"]}]'::jsonb,
 'Alla vapen kan tillverkas av mithril. Skärande egg ger 1 högre skada. Svärd och dolkar får 2 högre BV. Materialet är mycket lätt, hårt och tåligt.',60),
('silver','Silver',false,array['dagger','club','sword','morningstar','flail','projectile','throwing_star','arrow','bolt','spear']::text[],
 '[{"field":"price","op":"multiply","value":10}]'::jsonb,
 'Silver kan användas till vissa vapen och spetsar. Silvervapen kostar tio gånger normalpriset.',70),
('jade','Jade',false,array['sling_stone','arrow','bolt','spear']::text[],
 '[{"field":"damage","op":"add","value":-2,"require_any_tags":["sling_stone","arrow_point","bolt_point","spear_point"]},{"field":"special","op":"note","value":"Mot varelser särskilt känsliga för jade gör vapnet normal skada."}]'::jsonb,
 'Jade kan användas till slungstenar och spetsar till pil, skäkta och spjut. Normalt 2 lägre skada; mot jadekänsliga varelser används normal skada.',80),
('manticore','Mantikora',false,array['arrow','bolt']::text[],
 '[{"field":"damage","op":"add","value":1,"require_any_tags":["arrow_point","bolt_point"]}]'::jsonb,
 'Mantikorans svansspikar kan användas som spetsar till pilar och skäktor och ger 1 högre skada.',90),
('dragon_tooth','Draktand',false,array['spear']::text[],
 '[{"field":"damage","op":"add","value":2,"require_any_tags":["spear_point"]}]'::jsonb,
 'Draktänder kan användas som spjutspetsar och ger 2 högre skada.',100)
on conflict (material_key) do update set
name=excluded.name,is_default=excluded.is_default,allowed_any_tags=excluded.allowed_any_tags,
rules=excluded.rules,description=excluded.description,sort_order=excluded.sort_order,updated_at=now();
