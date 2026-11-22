create or replace function private.is_campaign_map_object_discovered(
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
      and (private.is_campaign_member(p_campaign_id) or private.is_campaign_gm(p_campaign_id) or private.is_admin())
  )
  select coalesce(bool_and(status='explored'), false)
  from rooms where shape @> p_position;
$$;
revoke all on function private.is_campaign_map_object_discovered(uuid,uuid,point) from public, anon;
grant execute on function private.is_campaign_map_object_discovered(uuid,uuid,point) to authenticated;

-- All API clients, including the GM preview, use the same explored-room read.
create or replace function public.read_adventure_player_areas(p_map_id uuid)
returns table(id uuid,location_id uuid,shape_type text,shape_data jsonb,sort_order integer,status text,name text)
language sql stable security invoker set search_path='' as $$
 select a.id,a.location_id,a.shape_type,a.shape_data,a.sort_order,s.status,
 concat_ws('. ',nullif(l.location_key,''),l.name)
 from public.campaign_maps m join public.campaign_map_areas a on a.map_id=m.id and a.campaign_id=m.campaign_id
 join public.campaign_location_state s on s.location_id=a.location_id and s.campaign_id=m.campaign_id and s.status='explored'
 join public.campaign_locations l on l.id=a.location_id and l.campaign_id=m.campaign_id
 where m.id=p_map_id and m.player_visible order by a.sort_order,a.id
$$;
create policy adventure_explored_areas on public.campaign_map_areas as restrictive for select to authenticated using (
 private.is_admin() or private.is_campaign_gm(campaign_id) or exists(select 1 from public.campaign_location_state s
 where s.campaign_id=campaign_map_areas.campaign_id and s.location_id=campaign_map_areas.location_id and s.status='explored')
);

-- Apply across all permissive Storage policies, including shared material/history.
create policy adventure_map_originals on storage.objects as restrictive for select to authenticated using (
 bucket_id<>'campaign-maps' or private.is_admin() or exists(select 1 from public.campaign_maps m
 where m.image_path=objects.name and private.is_campaign_gm(m.campaign_id))
);
create function public.adventure_raster_plan(p_map_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('path',m.image_path,'width',m.width,'height',m.height,'areas',coalesce((
 select jsonb_agg(jsonb_build_object('shape_type',a.shape_type,'shape_data',a.shape_data,'explored',coalesce(s.status='explored',false)))
 from public.campaign_map_areas a left join public.campaign_location_state s on s.campaign_id=a.campaign_id and s.location_id=a.location_id
 where a.map_id=m.id and a.campaign_id=m.campaign_id),'[]'::jsonb))
 from public.campaign_maps m where m.id=p_map_id and m.player_visible
$$;
revoke all on function public.adventure_raster_plan(uuid) from public,anon,authenticated;
grant execute on function public.adventure_raster_plan(uuid) to service_role;

create function private.adventure_figure_discovered(p_map uuid,p_campaign uuid,q integer,r integer)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_campaign_map_object_discovered(m.id,m.campaign_id,
 point(sqrt(3::float8)*sz*(q+r/2.0),1.5*sz*r))
 from public.campaign_maps m left join public.campaign_map_academy a on m.id=a.map_id and m.campaign_id=a.campaign_id
 cross join lateral (select coalesce((a.configuration->>'pixelsPerMeter')::float8,(to_jsonb(m)->>'pixels_per_meter')::float8,m.height/45.0) sz) grid
 where m.id=p_map and m.campaign_id=p_campaign and m.player_visible
$$;
revoke all on function private.adventure_figure_discovered(uuid,uuid,integer,integer) from public,anon;
grant execute on function private.adventure_figure_discovered(uuid,uuid,integer,integer) to authenticated;
create policy adventure_figures_explored on public.adventure_map_figures as restrictive for select to authenticated using (
 private.is_admin() or private.is_campaign_gm(campaign_id) or private.adventure_figure_discovered(map_id,campaign_id,q,r)
);
create function public.read_adventure_player_figures(p_map_id uuid,p_session_id uuid)
returns setof public.adventure_map_figures language sql stable security invoker set search_path='' as $$
 select f.* from public.adventure_map_figures f where f.map_id=p_map_id and f.session_id=p_session_id and f.player_visible
 and private.adventure_figure_discovered(f.map_id,f.campaign_id,f.q,f.r) order by f.r,f.q
$$;

-- Some DEV installations predate the optional object library.
create function public.read_adventure_player_objects(p_map_id uuid) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if to_regclass('public.campaign_map_objects') is null then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'object_definition_id',o.object_definition_id,
 'x',o.x,'y',o.y,'rotation',o.rotation)),'[]'::jsonb) into result from public.campaign_map_objects o
 where o.map_id=p_map_id and private.is_campaign_map_object_discovered(o.map_id,o.campaign_id,point(o.x,o.y));
 return result;
end; $$;
revoke all on function public.read_adventure_player_objects(uuid),public.read_adventure_player_figures(uuid,uuid),public.read_adventure_player_areas(uuid) from public,anon;
grant execute on function public.read_adventure_player_objects(uuid),public.read_adventure_player_figures(uuid,uuid),public.read_adventure_player_areas(uuid) to authenticated;

-- Location descriptions, linked images and their storage policies reuse this
-- decision. Independently shared material keeps its own publication contract.
create function private.adventure_location_shared(p_location uuid,p_campaign uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.is_campaign_member(p_campaign) and exists (
 select 1 from public.campaign_map_areas a join public.campaign_maps m on m.id=a.map_id and m.campaign_id=a.campaign_id
 join public.campaign_location_state s on s.location_id=a.location_id and s.campaign_id=a.campaign_id
 where a.location_id=p_location and a.campaign_id=p_campaign and m.player_visible and s.status='explored')
$$;
revoke all on function private.adventure_location_shared(uuid,uuid) from public,anon;
grant execute on function private.adventure_location_shared(uuid,uuid) to authenticated;
create policy adventure_room_text on public.campaign_location_player_texts as restrictive for select to authenticated using (
 private.is_admin() or private.is_campaign_gm(campaign_id) or private.adventure_location_shared(location_id,campaign_id)
);
create policy adventure_room_assets on public.campaign_location_assets as restrictive for select to authenticated using (
 private.is_admin() or private.is_campaign_gm(campaign_id) or private.adventure_location_shared(location_id,campaign_id)
);
create policy adventure_room_image_links on public.campaign_image_links as restrictive for select to authenticated using (
 object_type<>'place' or private.is_admin() or private.is_campaign_gm(campaign_id) or private.adventure_location_shared(object_id,campaign_id)
);
