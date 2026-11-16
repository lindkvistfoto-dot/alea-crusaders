-- Bring the remaining shared product structures forward without copying rows
-- from DEV. OLYMPIA tables and DEV-only seed/library records stay isolated.

alter table public.campaign_location_gm_notes
  add column if not exists hidden_discoveries text;

alter table public.combatant_battle_poses
  add column if not exists image_revision bigint not null default 0;
alter table public.race_battle_poses
  add column if not exists image_revision bigint not null default 0;

alter table public.rule_weapons
  add column if not exists image_asset_id text,
  add column if not exists image_revision bigint not null default 0;
alter table public.rule_armor_types
  add column if not exists image_head_asset_id text,
  add column if not exists image_head_revision bigint not null default 0,
  add column if not exists image_arms_asset_id text,
  add column if not exists image_arms_revision bigint not null default 0,
  add column if not exists image_torso_asset_id text,
  add column if not exists image_torso_revision bigint not null default 0,
  add column if not exists image_legs_asset_id text,
  add column if not exists image_legs_revision bigint not null default 0;

-- Shared battlefield schema only. DEV's wall-segment-prototype row is
-- intentionally not inserted into LIVE; each environment owns its own rows.
create table if not exists public.arcane_battlefield_library (
  object_key text primary key check (object_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null,
  category text not null default 'Objekt',
  asset_key text not null check (asset_key ~ '^arcane-battlefield-[a-z0-9-]+$'),
  description text not null default '',
  footprint jsonb not null default '[{"q":0,"r":0}]'::jsonb check (footprint = '[{"q":0,"r":0}]'::jsonb),
  connector_edges smallint[] not null default '{}' check (connector_edges <@ array[0,1,2,3,4,5]::smallint[]),
  movement_mode text not null default 'blocked' check (movement_mode in ('free','difficult','blocked')),
  sight_mode text not null default 'blocked' check (sight_mode in ('clear','obscuring','blocked')),
  movement_cost numeric not null default 1 check (movement_cost > 0),
  max_damage integer check (max_damage is null or max_damage > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.arcane_battlefield_library enable row level security;
revoke all privileges on table public.arcane_battlefield_library from public, anon, authenticated;
grant select, insert, update on public.arcane_battlefield_library to authenticated;
revoke truncate, references, trigger on table public.arcane_battlefield_library from service_role;
grant select, insert, update, delete on public.arcane_battlefield_library to service_role;

drop policy if exists arcane_battlefield_library_read on public.arcane_battlefield_library;
create policy arcane_battlefield_library_read on public.arcane_battlefield_library
  for select to authenticated using (active or private.is_admin());
drop policy if exists arcane_battlefield_library_admin_write on public.arcane_battlefield_library;
create policy arcane_battlefield_library_admin_write on public.arcane_battlefield_library
  for insert to authenticated with check (private.is_admin());
drop policy if exists arcane_battlefield_library_admin_update on public.arcane_battlefield_library;
create policy arcane_battlefield_library_admin_update on public.arcane_battlefield_library
  for update to authenticated using (private.is_admin()) with check (private.is_admin());

create table if not exists public.combat_battlefield_objects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  combat_id uuid not null references public.combat_instances(id) on delete cascade,
  object_key text not null references public.arcane_battlefield_library(object_key) on delete restrict,
  name_snapshot text not null,
  asset_key text not null,
  q integer not null,
  r integer not null,
  rotation smallint not null default 0 check (rotation between 0 and 5),
  footprint jsonb not null default '[{"q":0,"r":0}]'::jsonb,
  damage integer not null default 0 check (damage >= 0),
  max_damage integer check (max_damage is null or max_damage > 0),
  visible_to_players boolean not null default true,
  properties jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint combat_battlefield_objects_damage_limit check (damage <= max_damage),
  constraint combat_battlefield_objects_asset_key_check check (asset_key ~ '^arcane-battlefield-[a-z0-9-]+$'),
  constraint combat_battlefield_objects_one_per_hex unique (combat_id, q, r)
);

create index if not exists combat_battlefield_objects_campaign_combat_idx
  on public.combat_battlefield_objects (campaign_id, combat_id, r, q);

create or replace function private.validate_combat_battlefield_object()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_campaign uuid;
begin
  select ci.campaign_id into v_campaign
  from public.combat_instances as ci where ci.id = new.combat_id;
  if v_campaign is null or v_campaign <> new.campaign_id then
    raise exception 'Battlefield object campaign must match its combat instance.';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.touch_battlefield_object_combat()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_combat uuid;
begin
  v_combat := case when tg_op = 'DELETE' then old.combat_id else new.combat_id end;
  update public.combat_instances set updated_at = now() where id = v_combat;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists combat_battlefield_objects_validate on public.combat_battlefield_objects;
create trigger combat_battlefield_objects_validate
  before insert or update on public.combat_battlefield_objects
  for each row execute function private.validate_combat_battlefield_object();
drop trigger if exists combat_battlefield_objects_touch_combat on public.combat_battlefield_objects;
create trigger combat_battlefield_objects_touch_combat
  after insert or update or delete on public.combat_battlefield_objects
  for each row execute function private.touch_battlefield_object_combat();

alter table public.combat_battlefield_objects enable row level security;
revoke all privileges on table public.combat_battlefield_objects from public, anon, authenticated;
grant select, insert, update, delete on public.combat_battlefield_objects to authenticated;
revoke truncate, references, trigger on table public.combat_battlefield_objects from service_role;
grant select, insert, update, delete on public.combat_battlefield_objects to service_role;

drop policy if exists combat_battlefield_objects_select on public.combat_battlefield_objects;
create policy combat_battlefield_objects_select on public.combat_battlefield_objects
  for select to authenticated using ((visible_to_players and private.is_campaign_member(campaign_id)) or private.is_campaign_gm(campaign_id) or private.is_admin());
drop policy if exists combat_battlefield_objects_insert on public.combat_battlefield_objects;
create policy combat_battlefield_objects_insert on public.combat_battlefield_objects
  for insert to authenticated with check (private.is_campaign_gm(campaign_id) or private.is_admin());
drop policy if exists combat_battlefield_objects_update on public.combat_battlefield_objects;
create policy combat_battlefield_objects_update on public.combat_battlefield_objects
  for update to authenticated using (private.is_campaign_gm(campaign_id) or private.is_admin()) with check (private.is_campaign_gm(campaign_id) or private.is_admin());
drop policy if exists combat_battlefield_objects_delete on public.combat_battlefield_objects;
create policy combat_battlefield_objects_delete on public.combat_battlefield_objects
  for delete to authenticated using (private.is_campaign_gm(campaign_id) or private.is_admin());
