-- v0.35.84 Reusable types of magical powers, attached to individual artifact templates.
-- Both catalogs remain SL-only until item ownership/visibility rules are implemented.
create table if not exists public.rule_magic_property_definitions (
  id uuid primary key default gen_random_uuid(),
  property_key text not null unique
    check (property_key ~ '^[a-z][a-z0-9_]{1,79}$'),
  name text not null check (length(btrim(name)) between 1 and 160),
  kind text not null check (kind in ('spell','bonus','protection','status','special')),
  description text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.rule_magic_artifact_powers (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.rule_magic_artifacts(id) on delete cascade,
  property_id uuid not null references public.rule_magic_property_definitions(id) on delete restrict,
  spell_id uuid references public.rule_spells(id) on delete restrict,
  activation text not null default 'action'
    check (activation in ('passive','action','reaction','trigger')),
  effect_grade integer not null default 1 check (effect_grade between 1 and 50),
  psy_source text not null default 'artifact'
    check (psy_source in ('artifact','wearer','none')),
  charge_cost integer not null default 0 check (charge_cost between 0 and 1000),
  uses_per_day integer check (uses_per_day is null or uses_per_day >= 0),
  target_attribute text not null default '',
  bonus_value integer not null default 0,
  duration_text text not null default '',
  target_text text not null default '',
  details text not null default '',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rule_magic_artifact_powers_artifact_idx
  on public.rule_magic_artifact_powers(artifact_id,sort_order);
create index if not exists rule_magic_artifact_powers_property_idx
  on public.rule_magic_artifact_powers(property_id);
create index if not exists rule_magic_artifact_powers_spell_idx
  on public.rule_magic_artifact_powers(spell_id) where spell_id is not null;
comment on table public.rule_magic_property_definitions is
  'Reusable SL-defined power templates, e.g. cast spell, passive bonus, protection or custom effect.';
comment on table public.rule_magic_artifact_powers is
  'An artifact can have many configured powers. Execution is not automatic until combat integration is implemented.';
comment on column public.rule_magic_artifact_powers.psy_source is
  'Design setting for later runtime: artifact pool, wearer PSY or no PSY cost; do not modify current magic rules automatically.';

-- Ensure a spell-casting power selects an actual registered spell, even for API writes.
create or replace function public.validate_magic_artifact_power()
returns trigger language plpgsql set search_path = '' as $$
declare power_kind text;
begin
 select d.kind into power_kind from public.rule_magic_property_definitions d where d.id=new.property_id;
 if power_kind is null then
  raise exception 'Magisk egenskap finns inte';
 end if;
 if power_kind='spell' and new.spell_id is null then
  raise exception 'Besvärjelseegenskap kräver registrerad besvärjelse';
 elsif power_kind <> 'spell' and new.spell_id is not null then
  raise exception 'Endast besvärjelseegenskaper får länka besvärjelser';
 end if;
 return new;
end $$;
drop trigger if exists validate_magic_artifact_power_before_write on public.rule_magic_artifact_powers;
create trigger validate_magic_artifact_power_before_write
 before insert or update on public.rule_magic_artifact_powers
 for each row execute function public.validate_magic_artifact_power();

-- Changing the template kind under existing assignments could invalidate the
-- configured powers. Rename and descriptions remain editable.
create or replace function public.protect_magic_property_kind()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.kind is distinct from old.kind and exists(
  select 1 from public.rule_magic_artifact_powers p where p.property_id=old.id
 ) then
  raise exception 'Egenskapstypen kan inte ändras när artefakter använder den';
 end if;
 return new;
end $$;
drop trigger if exists protect_magic_property_kind_before_update on public.rule_magic_property_definitions;
create trigger protect_magic_property_kind_before_update
 before update on public.rule_magic_property_definitions
 for each row execute function public.protect_magic_property_kind();

alter table public.rule_magic_property_definitions enable row level security;
alter table public.rule_magic_artifact_powers enable row level security;
drop policy if exists magic_property_definitions_select on public.rule_magic_property_definitions;
create policy magic_property_definitions_select on public.rule_magic_property_definitions
 for select to authenticated using ((select private.is_admin()));
drop policy if exists magic_property_definitions_insert on public.rule_magic_property_definitions;
create policy magic_property_definitions_insert on public.rule_magic_property_definitions
 for insert to authenticated with check ((select private.is_admin()));
drop policy if exists magic_property_definitions_update on public.rule_magic_property_definitions;
create policy magic_property_definitions_update on public.rule_magic_property_definitions
 for update to authenticated using ((select private.is_admin()))
 with check ((select private.is_admin()));
drop policy if exists magic_property_definitions_delete on public.rule_magic_property_definitions;
create policy magic_property_definitions_delete on public.rule_magic_property_definitions
 for delete to authenticated using ((select private.is_admin()));
drop policy if exists magic_artifact_powers_select on public.rule_magic_artifact_powers;
create policy magic_artifact_powers_select on public.rule_magic_artifact_powers
 for select to authenticated using ((select private.is_admin()));
drop policy if exists magic_artifact_powers_insert on public.rule_magic_artifact_powers;
create policy magic_artifact_powers_insert on public.rule_magic_artifact_powers
 for insert to authenticated with check ((select private.is_admin()));
drop policy if exists magic_artifact_powers_update on public.rule_magic_artifact_powers;
create policy magic_artifact_powers_update on public.rule_magic_artifact_powers
 for update to authenticated using ((select private.is_admin()))
 with check ((select private.is_admin()));
drop policy if exists magic_artifact_powers_delete on public.rule_magic_artifact_powers;
create policy magic_artifact_powers_delete on public.rule_magic_artifact_powers
 for delete to authenticated using ((select private.is_admin()));
grant select,insert,update,delete on public.rule_magic_property_definitions to authenticated;
grant select,insert,update,delete on public.rule_magic_artifact_powers to authenticated;
revoke all on function public.validate_magic_artifact_power() from public,anon,authenticated;
revoke all on function public.protect_magic_property_kind() from public,anon,authenticated;

insert into public.rule_magic_property_definitions
 (property_key,name,kind,description,sort_order)
values
 ('cast_spell','Kasta besvärjelse','spell','Välj besvärjelse från Experts regelregister och ställ in EG, PSY-källa och laddningskostnad.',10),
 ('attribute_bonus','Magisk bonus','bonus','Passiv eller aktiverad bonus till en egenskap eller färdighet.',20),
 ('magic_protection','Magiskt skydd','protection','Skydd eller resistens med valfria villkor, styrka och varaktighet.',30),
 ('status_effect','Magiskt tillstånd','status','Tilldela ett tillstånd eller en återkommande effekt.',40),
 ('special_power','Särskild egenskap','special','För effekter som kräver en egen framtida regelkoppling eller SL-bedömning.',50)
on conflict (property_key) do nothing;
