-- Alea Crusaders – campaign content v1
-- Adds campaign events, NPCs, monsters and location content/linking.

create extension if not exists pgcrypto;

-- Reusable campaign objects ----------------------------------------------------

create table if not exists public.campaign_events (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  event_key text,
  name text not null,
  summary text not null default '',
  read_aloud text not null default '',
  trigger_text text not null default '',
  status text not null default 'planned',
  player_visible boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_events_status_check check (status in ('planned','active','resolved','disabled'))
);

create table if not exists public.campaign_npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  npc_key text,
  name text not null,
  title text not null default '',
  description text not null default '',
  gm_notes text not null default '',
  current_location_id uuid references public.campaign_locations(id) on delete set null,
  player_visible boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_monsters (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  monster_key text,
  name text not null,
  monster_type text not null default '',
  quantity integer not null default 1,
  description text not null default '',
  gm_notes text not null default '',
  current_location_id uuid references public.campaign_locations(id) on delete set null,
  player_visible boolean not null default false,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_monsters_quantity_check check (quantity >= 0)
);

create index if not exists campaign_events_campaign_idx on public.campaign_events(campaign_id, sort_order, name);
create index if not exists campaign_npcs_campaign_idx on public.campaign_npcs(campaign_id, sort_order, name);
create index if not exists campaign_monsters_campaign_idx on public.campaign_monsters(campaign_id, sort_order, name);

-- Location texts --------------------------------------------------------------
-- These tables may already exist from the map/location schema. Add the fields
-- used by the current admin UI without removing any existing data/columns.

create table if not exists public.campaign_location_player_texts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.campaign_locations(id) on delete cascade,
  text_kind text not null default 'description',
  title text not null default '',
  body text not null default '',
  player_visible boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaign_location_player_texts add column if not exists text_kind text not null default 'description';
alter table public.campaign_location_player_texts add column if not exists title text not null default '';
alter table public.campaign_location_player_texts add column if not exists body text not null default '';
alter table public.campaign_location_player_texts add column if not exists player_visible boolean not null default true;
alter table public.campaign_location_player_texts add column if not exists sort_order integer not null default 0;
alter table public.campaign_location_player_texts add column if not exists created_by uuid references auth.users(id);
alter table public.campaign_location_player_texts add column if not exists created_at timestamptz not null default now();
alter table public.campaign_location_player_texts add column if not exists updated_at timestamptz not null default now();

create table if not exists public.campaign_location_gm_notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.campaign_locations(id) on delete cascade,
  note_kind text not null default 'general',
  title text not null default '',
  body text not null default '',
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaign_location_gm_notes add column if not exists note_kind text not null default 'general';
alter table public.campaign_location_gm_notes add column if not exists title text not null default '';
alter table public.campaign_location_gm_notes add column if not exists body text not null default '';
alter table public.campaign_location_gm_notes add column if not exists sort_order integer not null default 0;
alter table public.campaign_location_gm_notes add column if not exists created_by uuid references auth.users(id);
alter table public.campaign_location_gm_notes add column if not exists created_at timestamptz not null default now();
alter table public.campaign_location_gm_notes add column if not exists updated_at timestamptz not null default now();

-- Location images/assets ------------------------------------------------------

create table if not exists public.campaign_location_assets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.campaign_locations(id) on delete cascade,
  asset_kind text not null default 'image',
  asset_type text not null default 'image',
  storage_path text not null,
  caption text not null default '',
  player_visible boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.campaign_location_assets add column if not exists asset_kind text not null default 'image';
alter table public.campaign_location_assets add column if not exists asset_type text not null default 'image';
alter table public.campaign_location_assets add column if not exists storage_path text;
alter table public.campaign_location_assets add column if not exists caption text not null default '';
alter table public.campaign_location_assets add column if not exists player_visible boolean not null default true;
alter table public.campaign_location_assets add column if not exists sort_order integer not null default 0;
alter table public.campaign_location_assets add column if not exists created_by uuid references auth.users(id);
alter table public.campaign_location_assets add column if not exists created_at timestamptz not null default now();
alter table public.campaign_location_assets add column if not exists updated_at timestamptz not null default now();

create index if not exists campaign_location_player_texts_location_idx on public.campaign_location_player_texts(location_id, sort_order);
create index if not exists campaign_location_gm_notes_location_idx on public.campaign_location_gm_notes(location_id, sort_order);
create index if not exists campaign_location_assets_location_idx on public.campaign_location_assets(location_id, sort_order);

-- Many-to-many links: a location can tag reusable campaign objects ------------

create table if not exists public.campaign_location_event_links (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.campaign_locations(id) on delete cascade,
  event_id uuid not null references public.campaign_events(id) on delete cascade,
  relation_kind text not null default 'related',
  created_at timestamptz not null default now(),
  primary key (location_id, event_id)
);

create table if not exists public.campaign_location_npc_links (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.campaign_locations(id) on delete cascade,
  npc_id uuid not null references public.campaign_npcs(id) on delete cascade,
  relation_kind text not null default 'related',
  created_at timestamptz not null default now(),
  primary key (location_id, npc_id)
);

create table if not exists public.campaign_location_monster_links (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  location_id uuid not null references public.campaign_locations(id) on delete cascade,
  monster_id uuid not null references public.campaign_monsters(id) on delete cascade,
  relation_kind text not null default 'related',
  created_at timestamptz not null default now(),
  primary key (location_id, monster_id)
);

create index if not exists campaign_location_event_links_event_idx on public.campaign_location_event_links(event_id);
create index if not exists campaign_location_npc_links_npc_idx on public.campaign_location_npc_links(npc_id);
create index if not exists campaign_location_monster_links_monster_idx on public.campaign_location_monster_links(monster_id);

-- RLS -------------------------------------------------------------------------

alter table public.campaign_events enable row level security;
alter table public.campaign_npcs enable row level security;
alter table public.campaign_monsters enable row level security;
alter table public.campaign_location_player_texts enable row level security;
alter table public.campaign_location_gm_notes enable row level security;
alter table public.campaign_location_assets enable row level security;
alter table public.campaign_location_event_links enable row level security;
alter table public.campaign_location_npc_links enable row level security;
alter table public.campaign_location_monster_links enable row level security;

grant select, insert, update, delete on public.campaign_events to authenticated;
grant select, insert, update, delete on public.campaign_npcs to authenticated;
grant select, insert, update, delete on public.campaign_monsters to authenticated;
grant select, insert, update, delete on public.campaign_location_player_texts to authenticated;
grant select, insert, update, delete on public.campaign_location_gm_notes to authenticated;
grant select, insert, update, delete on public.campaign_location_assets to authenticated;
grant select, insert, update, delete on public.campaign_location_event_links to authenticated;
grant select, insert, update, delete on public.campaign_location_npc_links to authenticated;
grant select, insert, update, delete on public.campaign_location_monster_links to authenticated;

-- Objects: GM/admin sees everything; players only explicitly visible objects.
drop policy if exists campaign_events_select on public.campaign_events;
create policy campaign_events_select on public.campaign_events for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or (player_visible and private.is_campaign_member(campaign_id)));
drop policy if exists campaign_events_write on public.campaign_events;
create policy campaign_events_write on public.campaign_events for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_npcs_select on public.campaign_npcs;
create policy campaign_npcs_select on public.campaign_npcs for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or (player_visible and private.is_campaign_member(campaign_id)));
drop policy if exists campaign_npcs_write on public.campaign_npcs;
create policy campaign_npcs_write on public.campaign_npcs for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_monsters_select on public.campaign_monsters;
create policy campaign_monsters_select on public.campaign_monsters for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or (player_visible and private.is_campaign_member(campaign_id)));
drop policy if exists campaign_monsters_write on public.campaign_monsters;
create policy campaign_monsters_write on public.campaign_monsters for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_location_player_texts_select on public.campaign_location_player_texts;
create policy campaign_location_player_texts_select on public.campaign_location_player_texts for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or (player_visible and private.is_campaign_member(campaign_id)));
drop policy if exists campaign_location_player_texts_write on public.campaign_location_player_texts;
create policy campaign_location_player_texts_write on public.campaign_location_player_texts for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_location_gm_notes_select on public.campaign_location_gm_notes;
create policy campaign_location_gm_notes_select on public.campaign_location_gm_notes for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id));
drop policy if exists campaign_location_gm_notes_write on public.campaign_location_gm_notes;
create policy campaign_location_gm_notes_write on public.campaign_location_gm_notes for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_location_assets_select on public.campaign_location_assets;
create policy campaign_location_assets_select on public.campaign_location_assets for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or (player_visible and private.is_campaign_member(campaign_id)));
drop policy if exists campaign_location_assets_write on public.campaign_location_assets;
create policy campaign_location_assets_write on public.campaign_location_assets for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_location_event_links_select on public.campaign_location_event_links;
create policy campaign_location_event_links_select on public.campaign_location_event_links for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or private.is_campaign_member(campaign_id));
drop policy if exists campaign_location_event_links_write on public.campaign_location_event_links;
create policy campaign_location_event_links_write on public.campaign_location_event_links for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_location_npc_links_select on public.campaign_location_npc_links;
create policy campaign_location_npc_links_select on public.campaign_location_npc_links for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or private.is_campaign_member(campaign_id));
drop policy if exists campaign_location_npc_links_write on public.campaign_location_npc_links;
create policy campaign_location_npc_links_write on public.campaign_location_npc_links for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

drop policy if exists campaign_location_monster_links_select on public.campaign_location_monster_links;
create policy campaign_location_monster_links_select on public.campaign_location_monster_links for select to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id) or private.is_campaign_member(campaign_id));
drop policy if exists campaign_location_monster_links_write on public.campaign_location_monster_links;
create policy campaign_location_monster_links_write on public.campaign_location_monster_links for all to authenticated
using (private.is_admin() or private.is_campaign_gm(campaign_id))
with check (private.is_admin() or private.is_campaign_gm(campaign_id));

-- Private location image storage ----------------------------------------------

insert into storage.buckets (id, name, public)
values ('campaign-location-assets','campaign-location-assets',false)
on conflict (id) do update set public = false;

drop policy if exists campaign_location_assets_storage_select on storage.objects;
create policy campaign_location_assets_storage_select on storage.objects
for select to authenticated
using (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1
    from public.campaign_location_assets a
    where a.storage_path = storage.objects.name
      and (
        private.is_admin()
        or private.is_campaign_gm(a.campaign_id)
        or (a.player_visible and private.is_campaign_member(a.campaign_id))
      )
  )
);

drop policy if exists campaign_location_assets_storage_insert on storage.objects;
create policy campaign_location_assets_storage_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1 from public.campaigns c
    where c.id::text = split_part(storage.objects.name,'/',1)
      and (private.is_admin() or private.is_campaign_gm(c.id))
  )
);

drop policy if exists campaign_location_assets_storage_update on storage.objects;
create policy campaign_location_assets_storage_update on storage.objects
for update to authenticated
using (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1 from public.campaigns c
    where c.id::text = split_part(storage.objects.name,'/',1)
      and (private.is_admin() or private.is_campaign_gm(c.id))
  )
)
with check (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1 from public.campaigns c
    where c.id::text = split_part(storage.objects.name,'/',1)
      and (private.is_admin() or private.is_campaign_gm(c.id))
  )
);

drop policy if exists campaign_location_assets_storage_delete on storage.objects;
create policy campaign_location_assets_storage_delete on storage.objects
for delete to authenticated
using (
  bucket_id = 'campaign-location-assets'
  and exists (
    select 1 from public.campaigns c
    where c.id::text = split_part(storage.objects.name,'/',1)
      and (private.is_admin() or private.is_campaign_gm(c.id))
  )
);
