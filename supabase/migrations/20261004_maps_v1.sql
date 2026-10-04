-- Alea Crusaders - maps v1
-- Campaign-specific maps, reveal state and private map-image storage.

create table if not exists public.campaign_maps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  image_path text not null,
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_maps_campaign_id_idx
  on public.campaign_maps(campaign_id, sort_order, name);

create table if not exists public.campaign_map_areas (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.campaign_maps(id) on delete cascade,
  area_key text,
  name text not null,
  shape_type text not null default 'polygon'
    check (shape_type in ('polygon','rect')),
  shape_data jsonb not null default '{}'::jsonb,
  status text not null default 'unknown'
    check (status in ('unknown','unexplored','explored')),
  sort_order integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_map_areas_map_id_idx
  on public.campaign_map_areas(map_id, sort_order, name);

create table if not exists public.campaign_map_settings (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  active_map_id uuid references public.campaign_maps(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.campaign_maps enable row level security;
alter table public.campaign_map_areas enable row level security;
alter table public.campaign_map_settings enable row level security;

revoke all on public.campaign_maps from anon;
revoke all on public.campaign_map_areas from anon;
revoke all on public.campaign_map_settings from anon;

grant select, insert, update, delete on public.campaign_maps to authenticated;
grant select, insert, update, delete on public.campaign_map_areas to authenticated;
grant select, insert, update, delete on public.campaign_map_settings to authenticated;

drop policy if exists campaign_maps_select on public.campaign_maps;
create policy campaign_maps_select
on public.campaign_maps
for select
to authenticated
using (
  private.is_admin()
  or private.is_campaign_member(campaign_id)
);

drop policy if exists campaign_maps_insert on public.campaign_maps;
create policy campaign_maps_insert
on public.campaign_maps
for insert
to authenticated
with check (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
);

drop policy if exists campaign_maps_update on public.campaign_maps;
create policy campaign_maps_update
on public.campaign_maps
for update
to authenticated
using (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
)
with check (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
);

drop policy if exists campaign_maps_delete on public.campaign_maps;
create policy campaign_maps_delete
on public.campaign_maps
for delete
to authenticated
using (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
);

drop policy if exists campaign_map_areas_select on public.campaign_map_areas;
create policy campaign_map_areas_select
on public.campaign_map_areas
for select
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.campaign_maps m
    where m.id = campaign_map_areas.map_id
      and private.is_campaign_member(m.campaign_id)
  )
);

drop policy if exists campaign_map_areas_insert on public.campaign_map_areas;
create policy campaign_map_areas_insert
on public.campaign_map_areas
for insert
to authenticated
with check (
  private.is_admin()
  or exists (
    select 1
    from public.campaign_maps m
    where m.id = campaign_map_areas.map_id
      and private.is_campaign_gm(m.campaign_id)
  )
);

drop policy if exists campaign_map_areas_update on public.campaign_map_areas;
create policy campaign_map_areas_update
on public.campaign_map_areas
for update
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.campaign_maps m
    where m.id = campaign_map_areas.map_id
      and private.is_campaign_gm(m.campaign_id)
  )
)
with check (
  private.is_admin()
  or exists (
    select 1
    from public.campaign_maps m
    where m.id = campaign_map_areas.map_id
      and private.is_campaign_gm(m.campaign_id)
  )
);

drop policy if exists campaign_map_areas_delete on public.campaign_map_areas;
create policy campaign_map_areas_delete
on public.campaign_map_areas
for delete
to authenticated
using (
  private.is_admin()
  or exists (
    select 1
    from public.campaign_maps m
    where m.id = campaign_map_areas.map_id
      and private.is_campaign_gm(m.campaign_id)
  )
);

drop policy if exists campaign_map_settings_select on public.campaign_map_settings;
create policy campaign_map_settings_select
on public.campaign_map_settings
for select
to authenticated
using (
  private.is_admin()
  or private.is_campaign_member(campaign_id)
);

drop policy if exists campaign_map_settings_insert on public.campaign_map_settings;
create policy campaign_map_settings_insert
on public.campaign_map_settings
for insert
to authenticated
with check (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
);

drop policy if exists campaign_map_settings_update on public.campaign_map_settings;
create policy campaign_map_settings_update
on public.campaign_map_settings
for update
to authenticated
using (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
)
with check (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
);

drop policy if exists campaign_map_settings_delete on public.campaign_map_settings;
create policy campaign_map_settings_delete
on public.campaign_map_settings
for delete
to authenticated
using (
  private.is_admin()
  or private.is_campaign_gm(campaign_id)
);

-- Private bucket for map images.
insert into storage.buckets (id, name, public)
values ('campaign-maps', 'campaign-maps', false)
on conflict (id) do update set public = false;

drop policy if exists campaign_maps_storage_select on storage.objects;
create policy campaign_maps_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_member(split_part(name, '/', 1)::uuid)
  )
);

drop policy if exists campaign_maps_storage_insert on storage.objects;
create policy campaign_maps_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(split_part(name, '/', 1)::uuid)
  )
);

drop policy if exists campaign_maps_storage_update on storage.objects;
create policy campaign_maps_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(split_part(name, '/', 1)::uuid)
  )
)
with check (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(split_part(name, '/', 1)::uuid)
  )
);

drop policy if exists campaign_maps_storage_delete on storage.objects;
create policy campaign_maps_storage_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'campaign-maps'
  and (
    private.is_admin()
    or private.is_campaign_gm(split_part(name, '/', 1)::uuid)
  )
);

-- Recommended storage path:
-- {campaign_id}/{map_id}/map.webp
