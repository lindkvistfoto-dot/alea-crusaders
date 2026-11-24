-- Living Objects V1. Some DEV installations already have player projection and
-- academy calibration, but never received the optional November 17 library.
-- Reconcile that baseline without modifying existing objects or discovery rules.
alter table public.campaign_maps
  add column if not exists pixels_per_meter numeric(12,4),
  add column if not exists scale_point_a jsonb,
  add column if not exists scale_point_b jsonb,
  add column if not exists scale_distance_m numeric(10,3);

create unique index if not exists campaign_maps_id_campaign_id_uidx
  on public.campaign_maps(id,campaign_id);

create table if not exists public.arcane_object_definitions (
  id uuid primary key default gen_random_uuid(),
  object_key text not null unique,
  name text not null,
  object_type text not null,
  image_asset_key text not null,
  width_m numeric(8,3) check (width_m > 0),
  depth_m numeric(8,3) check (depth_m > 0),
  height_m numeric(8,3) check (height_m > 0),
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

create or replace trigger map_sync_object_placements
  after insert or update or delete on public.campaign_map_objects
  for each row execute function private.bump_campaign_map_signal();

create or replace trigger trg_arcane_object_definitions_updated before update on public.arcane_object_definitions
  for each row execute function public.alea_set_updated_at();
create or replace trigger trg_campaign_map_objects_updated before update on public.campaign_map_objects
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
revoke all on public.arcane_object_definitions from anon,authenticated;
revoke all on public.campaign_map_objects from anon,authenticated;
grant select,insert,update,delete on public.arcane_object_definitions to authenticated;
grant select,insert,update,delete on public.campaign_map_objects to authenticated;


alter table public.arcane_object_definitions
  drop constraint if exists arcane_object_definitions_object_type_check,
  alter width_m drop not null, alter depth_m drop not null, alter height_m drop not null,
  add column description text,
  add column max_bep integer check (max_bep >= 0),
  add column battle_object_key text unique references public.arcane_battlefield_library(object_key);

-- Keys from Battle Library retain their legacy rules and HERMES reference.
-- Measurements remain null until a cartographer provides them.
create function private.link_battle_map_definition() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.arcane_object_definitions
    (battle_object_key,object_key,name,object_type,image_asset_key,description,max_bep,active,image_crop)
  values (new.object_key,'battle:'||new.object_key,new.name,new.category,new.asset_key,new.description,new.max_damage,new.active,'{}')
  on conflict (battle_object_key) do update set
    name=excluded.name,object_type=excluded.object_type,image_asset_key=excluded.image_asset_key,
    description=excluded.description,max_bep=excluded.max_bep,active=excluded.active;
  return new;
end $$;
revoke all on function private.link_battle_map_definition() from public,anon,authenticated;
create trigger link_battle_map_definition after insert or update on public.arcane_battlefield_library
  for each row execute function private.link_battle_map_definition();
insert into public.arcane_object_definitions
  (battle_object_key,object_key,name,object_type,image_asset_key,description,max_bep,active,image_crop)
select object_key,'battle:'||object_key,name,category,asset_key,description,max_damage,active,'{}'
from public.arcane_battlefield_library on conflict (battle_object_key) do nothing;

-- New art. Crop coordinates reference the source canvas and scale with its HERMES display.
insert into public.arcane_object_definitions
  (object_key,name,object_type,image_asset_key,width_m,depth_m,height_m,image_crop)
values
 ('woven-rug','Vävd matta','Matta','arcane-object-woven-rug',3,1.8,0.015,
  '{"x":22,"y":69,"width":1575,"height":827,"canvasWidth":1619,"canvasHeight":971}'),
 ('timber-barricade','Träbarrikad','Barrikad','arcane-object-timber-barricade',2.4,0.8,1.1,
  '{"x":39,"y":18,"width":2092,"height":690,"canvasWidth":2172,"canvasHeight":724}')
on conflict (object_key) do nothing;

alter table public.campaign_maps add column objects_initialized_at timestamptz;
alter table public.campaign_map_objects
  add column live boolean not null default false,
  add column prepared_id uuid,
  add column scale_factor numeric not null default 1 check (scale_factor > 0 and scale_factor < 'Infinity'::numeric),
  add column layer_order bigint not null default 0,
  add column locked boolean not null default false,
  add column player_visible boolean not null default true,
  add column max_bep integer check (max_bep >= 0),
  add column current_bep integer check (current_bep >= 0 and (max_bep is null or current_bep <= max_bep));
create unique index living_object_source on public.campaign_map_objects(map_id,prepared_id) where live;
create index living_object_stack on public.campaign_map_objects(map_id,live,layer_order,created_at,id);

create policy living_templates_read on public.arcane_object_definitions for select to authenticated using (true);
create policy living_template_boundary on public.arcane_object_definitions as restrictive for select to authenticated
 using (private.is_admin() or exists(select 1 from public.campaign_maps m where private.is_campaign_gm(m.campaign_id)));
create policy living_templates_admin on public.arcane_object_definitions for all to authenticated
 using (private.is_admin()) with check (private.is_admin());
create policy living_manager_read on public.campaign_map_objects for select to authenticated
 using (private.is_admin() or private.is_campaign_gm(campaign_id));
-- Also restrict installations with the older permissive discovery policy.
create policy living_instance_boundary on public.campaign_map_objects as restrictive for all to authenticated
 using (private.is_admin() or private.is_campaign_gm(campaign_id))
 with check (private.is_admin() or private.is_campaign_gm(campaign_id));
-- Instance writes are serialized through the command below, even for managers.
revoke insert,update,delete on public.campaign_map_objects from authenticated;

create or replace function public.read_adventure_player_objects(p_map_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'object_definition_id',o.object_definition_id,
   'x',o.x,'y',o.y,'rotation',o.rotation,'scale_factor',o.scale_factor,
   'definition',jsonb_build_object('id',d.id,'name',d.name,'image_asset_key',d.image_asset_key,
    'width_m',d.width_m,'depth_m',d.depth_m,'height_m',d.height_m,'image_crop',d.image_crop))
   order by o.layer_order,o.created_at,o.id),'[]'::jsonb)
 from public.campaign_map_objects o join public.campaign_maps m on m.id=o.map_id and m.campaign_id=o.campaign_id
 join public.arcane_object_definitions d on d.id=o.object_definition_id
 where o.map_id=p_map_id and o.live=(m.objects_initialized_at is not null) and o.player_visible
   and m.player_visible and (private.is_admin() or private.is_campaign_member(m.campaign_id) or private.is_campaign_gm(m.campaign_id))
   and private.is_campaign_map_object_discovered(o.map_id,o.campaign_id,point(o.x,o.y));
$$;
create function public.read_living_map_objects(p_map_id uuid,p_live boolean) returns setof public.campaign_map_objects
language sql stable security invoker set search_path='' as $$
 select o.* from public.campaign_map_objects o join public.campaign_maps m on o.map_id=m.id
 where o.map_id=p_map_id and o.live=(p_live and m.objects_initialized_at is not null)
 order by o.layer_order,o.created_at,o.id
$$;

create function public.edit_living_map_object(p_map_id uuid,p_live boolean,p_action text,p_id uuid,p_values jsonb default '{}')
returns uuid language plpgsql security definer set search_path='' as $$
declare
 m public.campaign_maps; obj public.campaign_map_objects; def public.arcane_object_definitions;
 ids uuid[]; pos integer; dest integer; top_layer bigint; result_id uuid;
begin
 if p_id is null or p_live is null then raise exception 'Objekt och kartläge krävs.'; end if;
 select * into strict m from public.campaign_maps where id=p_map_id
   and (private.is_admin() or private.is_campaign_gm(campaign_id)) for update;
 if p_live and m.objects_initialized_at is null then
   -- Take one snapshot inside the first live write. Removing the last piece never reseeds it.
   insert into public.campaign_map_objects(campaign_id,map_id,live,prepared_id,object_definition_id,
    x,y,rotation,scale_factor,layer_order,locked,player_visible,max_bep,current_bep,
    movement_blocking,light_blocking,shadow_casting,created_at)
   select campaign_id,map_id,true,id,object_definition_id,x,y,rotation,scale_factor,
    row_number() over(order by layer_order,created_at,id),locked,player_visible,max_bep,current_bep,
    movement_blocking,light_blocking,shadow_casting,created_at
   from public.campaign_map_objects where map_id=m.id and not live;
   update public.campaign_maps set objects_initialized_at=now() where id=m.id;
 end if;
 select * into obj from public.campaign_map_objects where map_id=m.id and live=p_live
   and (id=p_id or prepared_id=p_id);
 select coalesce(max(layer_order),0)+1 into top_layer from public.campaign_map_objects where map_id=m.id and live=p_live;
 if p_action='place' then
   if obj.id is not null then return obj.id; end if;
   select * into strict def from public.arcane_object_definitions where id=(p_values->>'definition')::uuid and active;
   if def.width_m is null or def.depth_m is null or def.height_m is null then raise exception 'Komplettera mallens mått först.'; end if;
   insert into public.campaign_map_objects(id,campaign_id,map_id,live,object_definition_id,x,y,rotation,layer_order,
    player_visible,max_bep,current_bep,movement_blocking,light_blocking,shadow_casting)
   values(p_id,m.campaign_id,m.id,p_live,def.id,(p_values->>'x')::numeric,(p_values->>'y')::numeric,def.default_rotation,
    top_layer,coalesce((p_values->>'player_visible')::boolean,true),def.max_bep,def.max_bep,def.movement_blocking,def.light_blocking,def.shadow_casting)
   returning * into obj;
 elsif obj.id is null then raise exception 'Objektet finns inte längre på kartan.';
 elsif p_action='duplicate' then
   result_id:=(p_values->>'new_id')::uuid;
   insert into public.campaign_map_objects(id,campaign_id,map_id,live,object_definition_id,x,y,rotation,scale_factor,
     layer_order,locked,player_visible,max_bep,current_bep,movement_blocking,light_blocking,shadow_casting)
   values(result_id,m.campaign_id,m.id,p_live,obj.object_definition_id,least(m.width,obj.x+5),least(m.height,obj.y+5),obj.rotation,obj.scale_factor,
     top_layer,false,obj.player_visible,obj.max_bep,obj.current_bep,obj.movement_blocking,obj.light_blocking,obj.shadow_casting)
   on conflict(id) do nothing;
   return result_id;
 elsif p_action='remove' then
   delete from public.campaign_map_objects where id=obj.id;
   return obj.id;
 elsif p_action in ('front','back','forward','backward') then
   select array_agg(id order by layer_order,created_at,id) into ids from public.campaign_map_objects where map_id=m.id and live=p_live;
   pos:=array_position(ids,obj.id);
   dest:=case p_action when 'front' then cardinality(ids) when 'back' then 1
    when 'forward' then least(pos+1,cardinality(ids)) else greatest(pos-1,1) end;
   ids:=array_remove(ids,obj.id);
   ids:=ids[1:dest-1] || array[obj.id] || ids[dest:cardinality(ids)];
   update public.campaign_map_objects o set layer_order=s.n from unnest(ids) with ordinality s(id,n)
     where o.id=s.id and o.layer_order<>s.n;
 elsif p_action='edit' then
   if obj.locked and p_values ?| array['x','y','rotation','scale_factor'] then raise exception 'Objektets position är låst.'; end if;
   update public.campaign_map_objects set x=coalesce((p_values->>'x')::numeric,x),y=coalesce((p_values->>'y')::numeric,y),
    rotation=mod(mod(coalesce((p_values->>'rotation')::numeric,rotation),360)+360,360),
    scale_factor=coalesce((p_values->>'scale_factor')::numeric,scale_factor),
    player_visible=coalesce((p_values->>'player_visible')::boolean,player_visible),
    locked=coalesce((p_values->>'locked')::boolean,locked),
    max_bep=case when p_values?'max_bep' then (p_values->>'max_bep')::integer else max_bep end,
    current_bep=case when p_values?'current_bep' then (p_values->>'current_bep')::integer else current_bep end,
    movement_blocking=coalesce((p_values->>'movement_blocking')::boolean,movement_blocking),
    light_blocking=coalesce((p_values->>'light_blocking')::boolean,light_blocking),
    shadow_casting=coalesce((p_values->>'shadow_casting')::boolean,shadow_casting)
   where id=obj.id returning * into obj;
 else raise exception 'Okänt objektkommando.';
 end if;
 if not (obj.x between 0 and m.width and obj.y between 0 and m.height) then raise exception 'Välj en position på kartan.'; end if;
 return obj.id;
end $$;
revoke all on function public.read_living_map_objects(uuid,boolean),public.edit_living_map_object(uuid,boolean,text,uuid,jsonb),
 public.read_adventure_player_objects(uuid) from public,anon;
grant execute on function public.read_living_map_objects(uuid,boolean),public.edit_living_map_object(uuid,boolean,text,uuid,jsonb),
 public.read_adventure_player_objects(uuid) to authenticated;
