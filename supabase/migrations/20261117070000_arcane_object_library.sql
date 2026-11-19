-- ARCANE OBJECT LIBRARY V1: shared physical object definitions and map placements.
alter table public.campaign_maps
  add column if not exists pixels_per_meter numeric(12,4),
  add column if not exists scale_point_a jsonb,
  add column if not exists scale_point_b jsonb,
  add column if not exists scale_distance_m numeric(10,3),
  add constraint campaign_maps_pixels_per_meter_check
    check (pixels_per_meter is null or pixels_per_meter > 0);

create unique index if not exists campaign_maps_id_campaign_id_uidx
  on public.campaign_maps(id,campaign_id);

create table if not exists public.arcane_object_definitions (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique,
  name text not null,
  object_type text not null check (object_type in ('table','chair','chest')),
  image_asset_key text not null,
  width_m numeric(8,3) not null check (width_m > 0),
  depth_m numeric(8,3) not null check (depth_m > 0),
  height_m numeric(8,3) not null check (height_m > 0),
  default_rotation numeric(7,2) not null default 0,
  revision integer not null default 1 check (revision > 0),
  active boolean not null default true,
  movement_blocking boolean not null default false,
  light_blocking boolean not null default false,
  shadow_casting boolean not null default false,
  footprint jsonb not null default '{"shape":"rectangle"}'::jsonb,
  image_crop jsonb not null default '{"x":0,"y":0,"width":1254,"height":1254}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_map_objects (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  map_id uuid not null,
  object_definition_id uuid not null references public.arcane_object_definitions(id) on delete restrict,
  x numeric(12,3) not null,
  y numeric(12,3) not null,
  rotation numeric(7,2) not null default 0,
  movement_blocking boolean not null default false,
  light_blocking boolean not null default false,
  shadow_casting boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint campaign_map_objects_map_fk foreign key (map_id,campaign_id)
    references public.campaign_maps(id,campaign_id) on delete cascade
);

create index if not exists campaign_map_objects_map_idx
  on public.campaign_map_objects(map_id,created_at);

drop trigger if exists map_sync_object_placements on public.campaign_map_objects;
create trigger map_sync_object_placements
  after insert or update or delete on public.campaign_map_objects
  for each row execute function private.bump_campaign_map_signal();

drop trigger if exists trg_arcane_object_definitions_updated on public.arcane_object_definitions;
create trigger trg_arcane_object_definitions_updated before update on public.arcane_object_definitions
  for each row execute function public.alea_set_updated_at();
drop trigger if exists trg_campaign_map_objects_updated on public.campaign_map_objects;
create trigger trg_campaign_map_objects_updated before update on public.campaign_map_objects
  for each row execute function public.alea_set_updated_at();

insert into public.arcane_object_definitions
  (object_key,name,object_type,image_asset_key,width_m,depth_m,height_m,default_rotation,footprint,image_crop)
values
  ('wooden-table','Träbord','table','arcane-object-wooden-table',1.800,0.900,0.750,0,'{"shape":"rectangle"}','{"x":25,"y":342,"width":1204,"height":573}'),
  ('wooden-chair','Trästol','chair','arcane-object-wooden-chair',0.500,0.500,0.900,0,'{"shape":"rectangle"}','{"x":209,"y":130,"width":836,"height":980}'),
  ('wooden-chest-closed','Träkista, stängd','chest','arcane-object-wooden-chest-closed',1.000,0.550,0.650,0,'{"shape":"rectangle"}','{"x":52,"y":383,"width":1150,"height":531}')
on conflict (object_key) do nothing;

alter table public.arcane_object_definitions enable row level security;
alter table public.campaign_map_objects enable row level security;
revoke all on public.arcane_object_definitions from anon;
revoke all on public.campaign_map_objects from anon;
grant select,insert,update,delete on public.arcane_object_definitions to authenticated;
grant select,insert,update,delete on public.campaign_map_objects to authenticated;

drop policy if exists arcane_object_definitions_read on public.arcane_object_definitions;
create policy arcane_object_definitions_read on public.arcane_object_definitions
  for select to authenticated using (true);
drop policy if exists arcane_object_definitions_admin on public.arcane_object_definitions;
create policy arcane_object_definitions_admin on public.arcane_object_definitions
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

create function private.is_campaign_map_object_discovered(
  p_map_id uuid, p_campaign_id uuid, p_position point
) returns boolean
language sql stable security definer set search_path = ''
as $$
  with rooms as (
    select coalesce(s.status, 'unknown') as status,
      case when a.shape_type = 'rect' then polygon(box(
        point((a.shape_data->>'x')::float8, (a.shape_data->>'y')::float8),
        point((a.shape_data->>'x')::float8 + (a.shape_data->>'width')::float8,
              (a.shape_data->>'y')::float8 + (a.shape_data->>'height')::float8)))
      when jsonb_array_length(a.shape_data->'points') >= 3 then
        (select ('(' || string_agg(format('(%s,%s)', (v->>0)::float8, (v->>1)::float8), ',' order by n) || ')')::polygon
          from jsonb_array_elements(a.shape_data->'points') with ordinality p(v,n))
      end as shape
    from public.campaign_maps m
    join public.campaign_map_areas a on a.map_id=m.id and a.campaign_id=m.campaign_id
    left join public.campaign_location_state s on s.location_id=a.location_id and s.campaign_id=a.campaign_id
    where m.id=p_map_id and m.campaign_id=p_campaign_id and m.player_visible
      and private.is_campaign_member(p_campaign_id)
  )
  select coalesce(bool_and(status='explored'), false)
  from rooms where shape @> p_position;
$$;
revoke all on function private.is_campaign_map_object_discovered(uuid,uuid,point) from public, anon;
grant execute on function private.is_campaign_map_object_discovered(uuid,uuid,point) to authenticated;

drop policy if exists campaign_map_objects_select on public.campaign_map_objects;
create policy campaign_map_objects_select on public.campaign_map_objects
  for select to authenticated using (
    private.is_admin() or private.is_campaign_gm(campaign_id) or
    private.is_campaign_map_object_discovered(map_id,campaign_id,point(x::float8,y::float8))
  );
drop policy if exists campaign_map_objects_manage on public.campaign_map_objects;
create policy campaign_map_objects_manage on public.campaign_map_objects
  for all to authenticated using (private.is_admin() or private.is_campaign_gm(campaign_id))
  with check (private.is_admin() or private.is_campaign_gm(campaign_id));
