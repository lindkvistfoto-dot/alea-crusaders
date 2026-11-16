-- Alea Crusaders – multiple combat scenes per event
-- A campaign event may own any number of named combat scenes.
-- Each scene selects its own map/location and owns its own hex terrain setup.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.campaign_monsters'::regclass
      and conname='campaign_monsters_id_campaign_id_key'
  ) then
    alter table public.campaign_monsters
      add constraint campaign_monsters_id_campaign_id_key unique (id,campaign_id);
  end if;
end
$$;

create table if not exists public.campaign_event_combat_scenes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campaign_events(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid,
  map_id uuid,
  name text not null default '',
  sort_order integer not null default 0,
  hex_orientation text not null default 'pointy',
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_scenes_orientation_check check (hex_orientation in ('pointy','flat')),
  constraint campaign_event_combat_scenes_event_campaign_fkey
    foreign key (event_id,campaign_id)
    references public.campaign_events(id,campaign_id)
    on delete cascade,
  constraint campaign_event_combat_scenes_location_campaign_fkey
    foreign key (location_id,campaign_id)
    references public.campaign_locations(id,campaign_id)
    on delete set null (location_id),
  constraint campaign_event_combat_scenes_map_campaign_fkey
    foreign key (map_id,campaign_id)
    references public.campaign_maps(id,campaign_id)
    on delete set null (map_id)
);

create table if not exists public.campaign_event_combat_scene_hexes (
  id uuid primary key default gen_random_uuid(),
  scene_id uuid not null references public.campaign_event_combat_scenes(id) on delete cascade,
  q integer not null,
  r integer not null,
  movement_mode text not null default 'free',
  sight_mode text not null default 'clear',
  movement_cost numeric(6,2) not null default 1,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_combat_scene_hexes_movement_check check (movement_mode in ('free','difficult','blocked')),
  constraint campaign_event_combat_scene_hexes_sight_check check (sight_mode in ('clear','obscuring','blocked')),
  constraint campaign_event_combat_scene_hexes_cost_check check (movement_cost > 0),
  constraint campaign_event_combat_scene_hexes_unique unique (scene_id,q,r)
);

create table if not exists public.campaign_event_enemies (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.campaign_events(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  monster_id uuid not null references public.campaign_monsters(id) on delete cascade,
  quantity integer not null default 1,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_event_enemies_quantity_check check (quantity between 1 and 100),
  constraint campaign_event_enemies_unique unique (event_id,monster_id),
  constraint campaign_event_enemies_event_campaign_fkey
    foreign key (event_id,campaign_id)
    references public.campaign_events(id,campaign_id)
    on delete cascade,
  constraint campaign_event_enemies_monster_campaign_fkey
    foreign key (monster_id,campaign_id)
    references public.campaign_monsters(id,campaign_id)
    on delete cascade
);

create index if not exists campaign_event_combat_scenes_event_idx
  on public.campaign_event_combat_scenes(event_id,sort_order,name);
create index if not exists campaign_event_combat_scenes_campaign_idx
  on public.campaign_event_combat_scenes(campaign_id);
create index if not exists campaign_event_combat_scenes_location_idx
  on public.campaign_event_combat_scenes(location_id);
create index if not exists campaign_event_combat_scenes_map_idx
  on public.campaign_event_combat_scenes(map_id);
create index if not exists campaign_event_combat_scene_hexes_scene_idx
  on public.campaign_event_combat_scene_hexes(scene_id,q,r);
create index if not exists campaign_event_enemies_event_idx
  on public.campaign_event_enemies(event_id,sort_order);
create index if not exists campaign_event_enemies_monster_idx
  on public.campaign_event_enemies(monster_id);

drop trigger if exists campaign_event_combat_scenes_updated_at on public.campaign_event_combat_scenes;
create trigger campaign_event_combat_scenes_updated_at
before update on public.campaign_event_combat_scenes
for each row execute function private.set_updated_at();

drop trigger if exists campaign_event_combat_scene_hexes_updated_at on public.campaign_event_combat_scene_hexes;
create trigger campaign_event_combat_scene_hexes_updated_at
before update on public.campaign_event_combat_scene_hexes
for each row execute function private.set_updated_at();

drop trigger if exists campaign_event_enemies_updated_at on public.campaign_event_enemies;
create trigger campaign_event_enemies_updated_at
before update on public.campaign_event_enemies
for each row execute function private.set_updated_at();

alter table public.campaign_event_combat_scenes enable row level security;
alter table public.campaign_event_combat_scene_hexes enable row level security;
alter table public.campaign_event_enemies enable row level security;

grant select,insert,update,delete on public.campaign_event_combat_scenes to authenticated;
grant select,insert,update,delete on public.campaign_event_combat_scene_hexes to authenticated;
grant select,insert,update,delete on public.campaign_event_enemies to authenticated;

drop policy if exists campaign_event_combat_scenes_select on public.campaign_event_combat_scenes;
create policy campaign_event_combat_scenes_select on public.campaign_event_combat_scenes
for select to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_scenes_insert on public.campaign_event_combat_scenes;
create policy campaign_event_combat_scenes_insert on public.campaign_event_combat_scenes
for insert to authenticated
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_scenes_update on public.campaign_event_combat_scenes;
create policy campaign_event_combat_scenes_update on public.campaign_event_combat_scenes
for update to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_scenes_delete on public.campaign_event_combat_scenes;
create policy campaign_event_combat_scenes_delete on public.campaign_event_combat_scenes
for delete to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_combat_scene_hexes_select on public.campaign_event_combat_scene_hexes;
create policy campaign_event_combat_scene_hexes_select on public.campaign_event_combat_scene_hexes
for select to authenticated
using (exists (
  select 1 from public.campaign_event_combat_scenes s
  where s.id=campaign_event_combat_scene_hexes.scene_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(s.campaign_id)))
));

drop policy if exists campaign_event_combat_scene_hexes_insert on public.campaign_event_combat_scene_hexes;
create policy campaign_event_combat_scene_hexes_insert on public.campaign_event_combat_scene_hexes
for insert to authenticated
with check (exists (
  select 1 from public.campaign_event_combat_scenes s
  where s.id=campaign_event_combat_scene_hexes.scene_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(s.campaign_id)))
));

drop policy if exists campaign_event_combat_scene_hexes_update on public.campaign_event_combat_scene_hexes;
create policy campaign_event_combat_scene_hexes_update on public.campaign_event_combat_scene_hexes
for update to authenticated
using (exists (
  select 1 from public.campaign_event_combat_scenes s
  where s.id=campaign_event_combat_scene_hexes.scene_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(s.campaign_id)))
))
with check (exists (
  select 1 from public.campaign_event_combat_scenes s
  where s.id=campaign_event_combat_scene_hexes.scene_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(s.campaign_id)))
));

drop policy if exists campaign_event_combat_scene_hexes_delete on public.campaign_event_combat_scene_hexes;
create policy campaign_event_combat_scene_hexes_delete on public.campaign_event_combat_scene_hexes
for delete to authenticated
using (exists (
  select 1 from public.campaign_event_combat_scenes s
  where s.id=campaign_event_combat_scene_hexes.scene_id
    and ((select private.is_admin()) or (select private.is_campaign_gm(s.campaign_id)))
));

drop policy if exists campaign_event_enemies_select on public.campaign_event_enemies;
create policy campaign_event_enemies_select on public.campaign_event_enemies
for select to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));

drop policy if exists campaign_event_enemies_write on public.campaign_event_enemies;
create policy campaign_event_enemies_write on public.campaign_event_enemies
for all to authenticated
using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)))
with check ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id)));
