-- A thin or concave undiscovered polygon may cut a straight step between two
-- discovered hex centers. Suppress the entire replay at any room boundary,
-- even between two explored rooms. Only the authorized destination then travels.
create or replace function private.adventure_trail_visible(m uuid,c uuid,trail jsonb) returns boolean
language sql stable set search_path='' as $$
 with ends as (
   select trail->0 a,trail->-1 b
 ), segment as (
   select lseg(point(sqrt(3::float8)*ppm*((a->>0)::int+(a->>1)::int/2.0),1.5*ppm*(a->>1)::int),
               point(sqrt(3::float8)*ppm*((b->>0)::int+(b->>1)::int/2.0),1.5*ppm*(b->>1)::int)) edge
   from public.campaign_maps board left join public.campaign_map_academy academy on academy.map_id=board.id
   cross join ends cross join lateral (select coalesce((academy.configuration->>'pixelsPerMeter')::float8,
      (to_jsonb(board)->>'pixels_per_meter')::float8,board.height/45.0) ppm) scale
   where board.id=m and board.campaign_id=c and board.player_visible
 ), rooms as (
   select case when shape_type='rect' then array[point(x,y),point(x+w,y),point(x+w,y+h),point(x,y+h)]
     else array(select point((p->>0)::float8,(p->>1)::float8) from jsonb_array_elements(shape_data->'points') p) end as pts
   from public.campaign_map_areas cross join lateral (select (shape_data->>'x')::float8 x,(shape_data->>'y')::float8 y,
     (shape_data->>'width')::float8 w,(shape_data->>'height')::float8 h) dims where map_id=m and campaign_id=c
 )
 select coalesce(private.adventure_figure_discovered(m,c,(a->>0)::int,(a->>1)::int) and
   private.adventure_figure_discovered(m,c,(b->>0)::int,(b->>1)::int) and
   not exists(select from rooms,segment,generate_series(1,cardinality(pts)) i
     where edge ?# lseg(pts[i],pts[1+i%cardinality(pts)])),false) from ends
$$;
