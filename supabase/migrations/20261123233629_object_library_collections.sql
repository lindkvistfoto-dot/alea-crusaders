-- Library scope belongs to the template. Existing rows remain shared.
create type public.map_object_category as enum (
  'Möbler', 'Förvaring och gods', 'Byggnadsdelar', 'Inredning och bruksföremål',
  'Eld och belysning', 'Hinder och försvar', 'Natur och terräng',
  'Monument och ritualföremål', 'Övrigt'
);
alter table public.arcane_object_definitions
  add column campaign_id uuid references public.campaigns(id) on delete cascade,
  add column library_category public.map_object_category not null default 'Övrigt',
  add constraint battle_templates_are_shared check (battle_object_key is null or campaign_id is null);
create index arcane_object_definitions_collection on public.arcane_object_definitions(campaign_id);

create function private.initial_map_object_category(p_type text) returns public.map_object_category
language sql stable set search_path='' as $$
 select case lower(btrim(p_type))
   when 'table' then 'Möbler' when 'chair' then 'Möbler'
   when 'chest' then 'Förvaring och gods' when 'murar' then 'Byggnadsdelar'
   when 'matta' then 'Inredning och bruksföremål' when 'barrikad' then 'Hinder och försvar'
   else coalesce((select c::text from unnest(enum_range(null::public.map_object_category)) c
                  where lower(c::text)=lower(btrim(p_type))), 'Övrigt')
 end::public.map_object_category
$$;
update public.arcane_object_definitions set library_category=private.initial_map_object_category(object_type)
where library_category is distinct from private.initial_map_object_category(object_type);

create or replace function private.link_battle_map_definition() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.arcane_object_definitions
    (battle_object_key,object_key,name,object_type,library_category,image_asset_key,description,max_bep,active,image_crop)
  values (new.object_key,'battle:'||new.object_key,new.name,new.category,private.initial_map_object_category(new.category),
    new.asset_key,new.description,new.max_damage,new.active,'{}')
  on conflict (battle_object_key) do update set
    name=excluded.name,object_type=excluded.object_type,image_asset_key=excluded.image_asset_key,
    description=excluded.description,max_bep=excluded.max_bep,active=excluded.active;
  return new;
end $$;

-- Moving an existing template between campaigns would also move access to all
-- its prepared and live instances. A new campaign template gets its own UUID.
create function private.keep_map_template_collection() returns trigger
language plpgsql set search_path='' as $$
begin
  raise exception 'Samlingen tillhör objektmallen. Skapa en ny mall för en annan kampanj.';
end $$;
create trigger keep_map_template_collection before update of campaign_id on public.arcane_object_definitions
  for each row when (old.campaign_id is distinct from new.campaign_id)
  execute function private.keep_map_template_collection();
revoke all on function private.initial_map_object_category(text), private.keep_map_template_collection() from public,anon,authenticated;

alter policy living_template_boundary on public.arcane_object_definitions using (
  private.is_admin() or
  (campaign_id is null and exists(select 1 from public.campaign_maps m where private.is_campaign_gm(m.campaign_id))) or
  (campaign_id is not null and private.is_campaign_gm(campaign_id))
);

-- The existing manager command runs as its owner. Check the map's actual campaign
-- when resolving a template, before reading its measurements or creating an instance.
create or replace function public.edit_living_map_object(p_map_id uuid,p_live boolean,p_action text,p_id uuid,p_values jsonb default '{}')
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
   select * into strict def from public.arcane_object_definitions where id=(p_values->>'definition')::uuid and active
     and (campaign_id is null or campaign_id=m.campaign_id);
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
