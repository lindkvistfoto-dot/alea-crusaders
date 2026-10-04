-- Alea Crusaders – participants per combat scene
-- Reuse existing campaign characters, NPCs and monster templates.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.characters'::regclass
      and conname='characters_id_campaign_id_key'
  ) then
    alter table public.characters
      add constraint characters_id_campaign_id_key unique (id,campaign_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.campaign_npcs'::regclass
      and conname='campaign_npcs_id_campaign_id_key'
  ) then
    alter table public.campaign_npcs
      add constraint campaign_npcs_id_campaign_id_key unique (id,campaign_id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid='public.campaign_event_combat_scenes'::regclass
      and conname='campaign_event_combat_scenes_id_campaign_id_key'
  ) then
    alter table public.campaign_event_combat_scenes
      add constraint campaign_event_combat_scenes_id_campaign_id_key unique (id,campaign_id);
  end if;
end
$$;

create table if not exists public.campaign_event_combat_scene_characters (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  character_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_scene_characters_unique unique (scene_id,character_id),
  constraint campaign_event_combat_scene_characters_scene_fkey
    foreign key (scene_id,campaign_id)
    references public.campaign_event_combat_scenes(id,campaign_id)
    on delete cascade,
  constraint campaign_event_combat_scene_characters_character_fkey
    foreign key (character_id,campaign_id)
    references public.characters(id,campaign_id)
    on delete cascade
);

create table if not exists public.campaign_event_combat_scene_npcs (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  npc_id uuid not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_scene_npcs_unique unique (scene_id,npc_id),
  constraint campaign_event_combat_scene_npcs_scene_fkey
    foreign key (scene_id,campaign_id)
    references public.campaign_event_combat_scenes(id,campaign_id)
    on delete cascade,
  constraint campaign_event_combat_scene_npcs_npc_fkey
    foreign key (npc_id,campaign_id)
    references public.campaign_npcs(id,campaign_id)
    on delete cascade
);

create table if not exists public.campaign_event_combat_scene_monsters (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null,
  campaign_id uuid not null,
  monster_id uuid not null,
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_scene_monsters_unique unique (scene_id,monster_id),
  constraint campaign_event_combat_scene_monsters_quantity_check check (quantity between 1 and 100),
  constraint campaign_event_combat_scene_monsters_scene_fkey
    foreign key (scene_id,campaign_id)
    references public.campaign_event_combat_scenes(id,campaign_id)
    on delete cascade,
  constraint campaign_event_combat_scene_monsters_monster_fkey
    foreign key (monster_id,campaign_id)
    references public.campaign_monsters(id,campaign_id)
    on delete cascade
);

create index if not exists campaign_event_combat_scene_characters_scene_idx
  on public.campaign_event_combat_scene_characters(scene_id,sort_order);
create index if not exists campaign_event_combat_scene_characters_character_idx
  on public.campaign_event_combat_scene_characters(character_id);
create index if not exists campaign_event_combat_scene_npcs_scene_idx
  on public.campaign_event_combat_scene_npcs(scene_id,sort_order);
create index if not exists campaign_event_combat_scene_npcs_npc_idx
  on public.campaign_event_combat_scene_npcs(npc_id);
create index if not exists campaign_event_combat_scene_monsters_scene_idx
  on public.campaign_event_combat_scene_monsters(scene_id,sort_order);
create index if not exists campaign_event_combat_scene_monsters_monster_idx
  on public.campaign_event_combat_scene_monsters(monster_id);

drop trigger if exists campaign_event_combat_scene_characters_updated_at on public.campaign_event_combat_scene_characters;
create trigger campaign_event_combat_scene_characters_updated_at
before update on public.campaign_event_combat_scene_characters
for each row execute function private.set_updated_at();

drop trigger if exists campaign_event_combat_scene_npcs_updated_at on public.campaign_event_combat_scene_npcs;
create trigger campaign_event_combat_scene_npcs_updated_at
before update on public.campaign_event_combat_scene_npcs
for each row execute function private.set_updated_at();

drop trigger if exists campaign_event_combat_scene_monsters_updated_at on public.campaign_event_combat_scene_monsters;
create trigger campaign_event_combat_scene_monsters_updated_at
before update on public.campaign_event_combat_scene_monsters
for each row execute function private.set_updated_at();

alter table public.campaign_event_combat_scene_characters enable row level security;
alter table public.campaign_event_combat_scene_npcs enable row level security;
alter table public.campaign_event_combat_scene_monsters enable row level security;

grant select,insert,update,delete on public.campaign_event_combat_scene_characters to authenticated;
grant select,insert,update,delete on public.campaign_event_combat_scene_npcs to authenticated;
grant select,insert,update,delete on public.campaign_event_combat_scene_monsters to authenticated;

drop policy if exists campaign_event_combat_scene_characters_manage on public.campaign_event_combat_scene_characters;
create policy campaign_event_combat_scene_characters_manage on public.campaign_event_combat_scene_characters
for all to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_scene_npcs_manage on public.campaign_event_combat_scene_npcs;
create policy campaign_event_combat_scene_npcs_manage on public.campaign_event_combat_scene_npcs
for all to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_scene_monsters_manage on public.campaign_event_combat_scene_monsters;
create policy campaign_event_combat_scene_monsters_manage on public.campaign_event_combat_scene_monsters
for all to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
