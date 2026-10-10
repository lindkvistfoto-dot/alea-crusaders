-- Magical artifacts are independent named items; an optional ordinary master is
-- only their base model, never a magic flag on every copy of that base model.
create table if not exists public.rule_magic_artifacts (
 id uuid primary key default gen_random_uuid(),
 artifact_key text not null unique
  check (artifact_key ~ '^[a-z][a-z0-9_]{1,79}$'),
 name text not null check (length(btrim(name)) between 1 and 160),
 item_type text not null default 'other'
  check (item_type in ('amulet','ring','weapon','armor','shield','staff','wand','equipment','other')),
 base_kind text check (base_kind in ('weapon','armor','shield','equipment')),
 base_item_id uuid,
 appearance text not null default '',
 magic_properties text not null default '',
 activation text not null default '',
 magic_bonus integer not null default 0,
 max_charges integer check (max_charges is null or max_charges >= 0),
 uses_per_day integer check (uses_per_day is null or uses_per_day >= 0),
 rarity text not null default 'uncommon'
  check (rarity in ('common','uncommon','rare','legendary','unique')),
 value_sm numeric check (value_sm is null or value_sm >= 0),
 gm_notes text not null default '',
 active boolean not null default true,
 sort_order integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint rule_magic_artifacts_base_pair_check check (
  (base_kind is null and base_item_id is null)
  or (base_kind is not null and base_item_id is not null)
 )
);
create index if not exists rule_magic_artifacts_base_idx
 on public.rule_magic_artifacts(base_kind,base_item_id)
 where base_kind is not null;
comment on table public.rule_magic_artifacts is
 'SL-only magic artifact templates; base_item_id is a reference to an ordinary model, not a grant of magic to all instances.';
comment on column public.rule_magic_artifacts.base_item_id is
 'Polymorphic reference to rule_weapons/rule_armor_types/rule_shields/rule_shop_items by base_kind. Checked by editor, not a SQL FK.';
alter table public.rule_magic_artifacts enable row level security;
drop policy if exists rule_magic_artifacts_select_admin on public.rule_magic_artifacts;
create policy rule_magic_artifacts_select_admin on public.rule_magic_artifacts
 for select to authenticated using ((select private.is_admin()));
drop policy if exists rule_magic_artifacts_insert_admin on public.rule_magic_artifacts;
create policy rule_magic_artifacts_insert_admin on public.rule_magic_artifacts
 for insert to authenticated with check ((select private.is_admin()));
drop policy if exists rule_magic_artifacts_update_admin on public.rule_magic_artifacts;
create policy rule_magic_artifacts_update_admin on public.rule_magic_artifacts
 for update to authenticated using ((select private.is_admin()))
 with check ((select private.is_admin()));
drop policy if exists rule_magic_artifacts_delete_admin on public.rule_magic_artifacts;
create policy rule_magic_artifacts_delete_admin on public.rule_magic_artifacts
 for delete to authenticated using ((select private.is_admin()));
grant select,insert,update,delete on public.rule_magic_artifacts to authenticated;

alter table public.rule_weapons
 add column if not exists is_magical boolean not null default false;
alter table public.rule_armor_types
 add column if not exists is_magical boolean not null default false;
alter table public.rule_shields
 add column if not exists is_magical boolean not null default false;
alter table public.rule_shop_items
 add column if not exists is_magical boolean not null default false;
comment on column public.rule_weapons.is_magical is
 'Only this weapon master type is itself magical. Does not inherit from artifact templates using it as their base.';
comment on column public.rule_armor_types.is_magical is
 'Only this armor master type is itself magical. Ordinary base armor is unaffected by artifact variants.';
comment on column public.rule_shop_items.is_magical is
 'Only this equipment master item is itself magical. No automatic spell bonuses.';
comment on column public.rule_shields.is_magical is
 'Only this shield master type is itself magical. No automatic defense bonuses.';
