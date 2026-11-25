-- Display and movement state belong to the map visit. Only the public display
-- projection leaves this manager-only table. No path or secret actor is broadcast.
create table public.adventure_hex_state (
  campaign_id uuid not null, map_id uuid not null, session_id uuid not null,
  epoch integer not null default 0, round_no integer not null default 0,
  prefs jsonb not null default '{}', spent jsonb not null default '{}',
  trails jsonb not null default '{}', dispositions jsonb not null default '{}',
  primary key (session_id,map_id),
  foreign key (map_id,campaign_id) references public.campaign_maps(id,campaign_id) on delete cascade,
  foreign key (session_id,campaign_id) references public.game_sessions(id,campaign_id) on delete cascade
);
alter table public.adventure_hex_state enable row level security;
revoke all on public.adventure_hex_state from public,anon,authenticated;
create trigger adventure_hex_display after update on public.adventure_hex_state
  for each row when (old.epoch is distinct from new.epoch)
  execute function private.bump_campaign_map_signal();

-- Use the same movement sources and precedence as combatSourceStats.
create function private.adventure_move_max(f public.adventure_map_figures) returns integer
language sql stable set search_path='' as $$
 select greatest(0,floor(coalesce((select raw::numeric from (values
   (1,(select c.data->'derived'->>'Förflyttning' from public.characters c where c.id=coalesce(f.character_id,f.npc_character_id))),
   (2,attrs->>'FORFLYTTNING'),(3,attrs->>'SMI')) as choices(rank,raw)
   where raw ~ '^-?[0-9]+([.][0-9]+)?$' order by rank limit 1),10)))::integer
 from (select coalesce((select n.attributes from public.campaign_npcs n where n.id=f.npc_id),
    (select n.attributes from public.campaign_monsters n where n.id=f.monster_id),'{}') attrs) sources
$$;
revoke all on function private.adventure_move_max(public.adventure_map_figures) from public,anon,authenticated;

-- Players may replay only a straight, recently observed passage. Detours can
-- disclose an unseen obstacle. Never return their intermediate coordinates.
create function private.adventure_trail_visible(m uuid,c uuid,trail jsonb) returns boolean
language sql stable set search_path='' as $$
 select not exists(select from jsonb_array_elements(trail) p where
   private.adventure_figure_discovered(m,c,(p->>0)::int,(p->>1)::int) is not true)
$$;
revoke all on function private.adventure_trail_visible(uuid,uuid,jsonb) from public,anon,authenticated;
create function public.read_adventure_hex(p_map uuid,p_session uuid,p_manager boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('round',coalesce(s.round_no,0),'epoch',coalesce(s.epoch,0),'prefs',coalesce(s.prefs,'{}'),
   'dispositions',case when p_manager and (private.is_campaign_gm(m.campaign_id) or private.is_admin()) then coalesce(s.dispositions,'{}') else '{}'::jsonb end,
   'trails',case when not p_manager then (select coalesce(jsonb_object_agg(f.id,t.value->'cells'),'{}')
     from jsonb_each(s.trails) t join public.adventure_map_figures f on f.id=t.key::uuid
     where f.map_id=m.id and f.session_id=g.id and f.player_visible and
       (t.value->>'until')::timestamptz>now() and
       t.value->'cells'->-1=jsonb_build_array(f.q,f.r) and private.adventure_trail_visible(m.id,m.campaign_id,t.value->'cells'))
     else '{}'::jsonb end,
   'budgets',case when p_manager and (private.is_campaign_gm(m.campaign_id) or private.is_admin()) and s.round_no>0 then
     (select coalesce(jsonb_object_agg(f.id,jsonb_build_object('max',private.adventure_move_max(f),'spent',coalesce((s.spent->>f.id::text)::int,0))),'{}')
      from public.adventure_map_figures f where f.session_id=p_session and f.map_id=m.id) else '{}'::jsonb end)
 from public.campaign_maps m join public.game_sessions g on g.campaign_id=m.campaign_id and g.id=p_session
 left join public.adventure_hex_state s on s.map_id=m.id and s.session_id=g.id
 where m.id=p_map and g.status='active' and
 ((p_manager and (private.is_admin() or private.is_campaign_gm(m.campaign_id))) or
 (m.player_visible and (private.is_campaign_member(m.campaign_id) or private.is_admin() or private.is_campaign_gm(m.campaign_id))))
$$;

-- Snapshot the actual movement barriers for the entire commit, including thin doors between centers.
create function private.adventure_check_path(m public.campaign_maps, f public.adventure_map_figures, route jsonb)
returns void language plpgsql stable set search_path='' as $$
declare
 config jsonb; mask jsonb; ppm float8; width_px float8; pitch float8;
 edges lseg[]; solid polygon[]; a point; b point; edge lseg; cell jsonb;
 mw int; mh int; free_pixels int4multirange; ix int; iy int; dx float8; dy float8;
begin
 select configuration into config from public.campaign_map_academy where map_id=m.id;
 ppm=coalesce((config->>'pixelsPerMeter')::float8,(to_jsonb(m)->>'pixels_per_meter')::float8,m.height/45.0);
 width_px=sqrt(3::float8)*ppm; pitch=1.5*ppm;
 with outlines as (
  select array(select point((p->>0)::float8,(p->>1)::float8) from jsonb_array_elements(shape->'points') p) pts,
   (shape->>'closed')::boolean closed from jsonb_array_elements(config->'geometry') shape where shape->'movement'='true'
  union all
  select array(select point(o.x+u*w*cos(rad)-v*h*sin(rad),o.y+u*w*sin(rad)+v*h*cos(rad))
    from (values (-1,-1),(1,-1),(1,1),(-1,1)) corners(u,v)),true
  from public.campaign_map_objects o join public.arcane_object_definitions d on d.id=o.object_definition_id
  cross join lateral (select d.width_m*o.scale_factor*ppm/2 w,d.depth_m*o.scale_factor*ppm/2 h,radians(o.rotation::float8) rad) sizes
  where o.map_id=m.id and o.live=(m.objects_initialized_at is not null) and o.movement_blocking and w>0 and h>0
 )
 select array(select lseg(pts[i],pts[1+i%cardinality(pts)]) from outlines,
    generate_series(1,cardinality(pts)-case when closed then 0 else 1 end) i),
   array(select ('('||array_to_string(pts,',')||')')::polygon from outlines where closed and cardinality(pts)>=3)
 into edges,solid;
 mask=config->'freeSight';
 if jsonb_array_length(mask->'runs')>0 then
   mw=(mask->>'width')::int;mh=(mask->>'height')::int;dx=m.width::float8/mw;dy=m.height::float8/mh;
   select range_agg(int4range((r->>0)::int,(r->>0)::int+(r->>1)::int,'[)')) into free_pixels from jsonb_array_elements(mask->'runs') r;
 end if;
 a=point(width_px*(f.q+f.r/2.0),pitch*f.r);
 for cell in select value from jsonb_array_elements(route) loop
   b=point(width_px*((cell->>0)::int+(cell->>1)::int/2.0),pitch*(cell->>1)::int);edge=lseg(a,b);
   if b[0]-width_px/2<0 or b[0]+width_px/2>m.width or b[1]-ppm<0 or b[1]+ppm>m.height or
      exists(select from unnest(edges) e where edge ?# e) or exists(select from unnest(solid) poly where poly @> b)
      then raise exception 'Färdvägen är blockerad.'; end if;
   if free_pixels is not null then
     -- Enumerate intersected scan lines, then only the narrow X span of this segment within that line.
     for iy in floor(least(a[1],b[1])/dy)::int..floor(greatest(a[1],b[1])/dy)::int loop
       declare t0 float8=0; t1 float8=1; x0 float8; x1 float8; first_t float8; last_t float8;
       begin
         if b[1]<>a[1] then
           t0=(iy*dy-a[1])/(b[1]-a[1]);t1=((iy+1)*dy-a[1])/(b[1]-a[1]);
         end if;
         first_t=greatest(0,least(t0,t1));last_t=least(1,greatest(t0,t1));
         x0=a[0]+first_t*(b[0]-a[0]);x1=a[0]+last_t*(b[0]-a[0]);
         if not free_pixels @> int4range(iy*mw+floor(least(x0,x1)/dx)::int,iy*mw+floor(greatest(x0,x1)/dx)::int+1,'[)') then
           raise exception 'Färdvägen lämnar fri golvyta.'; end if;
       end;
     end loop;
   end if;
   a=b;
 end loop;
end $$;
revoke all on function private.adventure_check_path(public.campaign_maps,public.adventure_map_figures,jsonb) from public,anon,authenticated;

-- V1 clients may still place figures. A tactical move must participate in the
-- same row-locked budget transaction, even if an older board issues a PATCH.
create function private.guard_adventure_hex_destination() returns trigger
language plpgsql security definer set search_path='' as $$
declare m public.campaign_maps;
begin
 if current_setting('alea.hex_move_object',true)=new.id::text then return new; end if;
 if tg_op='UPDATE' and (old.q,old.r) is distinct from (new.q,new.r) and exists(
    select from public.adventure_hex_state where map_id=new.map_id and session_id=new.session_id and round_no>0)
   then raise exception 'Flytta figuren längs en färdväg i strid.'; end if;
 select * into strict m from public.campaign_maps where id=new.map_id and campaign_id=new.campaign_id;
 perform private.adventure_check_path(m,new,jsonb_build_array(jsonb_build_array(new.q,new.r)));
 return new;
end $$;
revoke all on function private.guard_adventure_hex_destination() from public,anon,authenticated;
create trigger adventure_hex_destination before insert or update of q,r,map_id,session_id on public.adventure_map_figures
for each row execute function private.guard_adventure_hex_destination();

create function public.command_adventure_hex(p_map uuid,p_session uuid,p_epoch integer,p_action text,p_values jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 m public.campaign_maps; s public.adventure_hex_state; f public.adventure_map_figures;
 pos jsonb; current_q int; current_r int; nq int; nr int; cost int; used int; dq int; dr int; straight boolean=true; trail jsonb;
begin
 select * into strict m from public.campaign_maps where id=p_map;
 if (private.is_campaign_gm(m.campaign_id) or private.is_admin()) is not true then raise exception 'Endast SL kan styra hexagonerna.'; end if;
 perform 1 from public.game_sessions where id=p_session and campaign_id=m.campaign_id and status='active' for share;
 if not found then raise exception 'Spelmötet är inte aktivt.'; end if;
 insert into public.adventure_hex_state(campaign_id,map_id,session_id) values(m.campaign_id,p_map,p_session) on conflict do nothing;
 select * into strict s from public.adventure_hex_state where map_id=p_map and session_id=p_session for update;
 if s.epoch is distinct from p_epoch then raise exception 'Kartläget har ändrats. Välj igen.'; end if;
 if (p_action='begin' and s.round_no=0) or (p_action in ('round','end') and s.round_no>0) then
   update public.adventure_hex_state set round_no=case when p_action='end' then 0 else round_no+1 end,
    spent='{}',epoch=epoch+1 where map_id=p_map and session_id=p_session;
 elsif p_action='setting' then
   if not ((p_values->>'key'='grid' and p_values->>'value' in ('auto','always','hidden')) or
     (p_values->>'key' in ('actors','path') and jsonb_typeof(p_values->'value')='boolean') or
     (p_values->>'key' in ('glow','motion','opacity') and jsonb_typeof(p_values->'value')='number' and
       (p_values->>'value') ~ '^(100|[1-9]?[0-9])$')) is true then raise exception 'Ogiltigt visningsval.'; end if;
   update public.adventure_hex_state set prefs=prefs||jsonb_build_object(p_values->>'key',p_values->'value'),
     epoch=epoch+1 where map_id=p_map and session_id=p_session;
 elsif p_action='disposition' then
   select * into strict f from public.adventure_map_figures where id=(p_values->>'id')::uuid and map_id=p_map and session_id=p_session;
   if f.character_id is not null or coalesce(p_values->>'tone','') not in ('sapphire','amber','ruby','unknown') then raise exception 'Ogiltig tillhörighet.'; end if;
   update public.adventure_hex_state set dispositions=dispositions||jsonb_build_object(f.id::text,p_values->>'tone')
    where map_id=p_map and session_id=p_session;
 elsif p_action='move' then
   select * into strict f from public.adventure_map_figures where id=(p_values->>'id')::uuid and map_id=p_map and session_id=p_session for update;
   if f.q is distinct from (p_values->'from'->>0)::int or f.r is distinct from (p_values->'from'->>1)::int then
     raise exception 'Figuren har flyttats. Välj igen.'; end if;
   cost=jsonb_array_length(p_values->'path');
   if cost is null or cost<1 then raise exception 'Färdvägen saknas.'; end if;
   used=coalesce((s.spent->>f.id::text)::int,0);
   if s.round_no>0 and used+cost>private.adventure_move_max(f) then raise exception 'Förflyttningen överstiger rundans budget.'; end if;
   current_q=f.q;current_r=f.r;
   for pos in select value from jsonb_array_elements(p_values->'path') loop
     nq=(pos->>0)::integer;nr=(pos->>1)::integer;
     if nq is null or nr is null or greatest(abs(nq-current_q),abs(nr-current_r),abs(nq-current_q+nr-current_r))<>1 then
       raise exception 'Färdvägen måste följa angränsande hexagoner.'; end if;
     if exists(select from public.adventure_map_figures o where o.session_id=p_session and o.map_id=p_map and o.q=nq and o.r=nr and o.id<>f.id)
       then raise exception 'Färdvägen är upptagen.'; end if;
     if dq is null then dq=nq-current_q;dr=nr-current_r;
     elsif dq<>nq-current_q or dr<>nr-current_r then straight=false; end if;
     current_q=nq;current_r=nr;
   end loop;
   perform private.adventure_check_path(m,f,p_values->'path');
   perform set_config('alea.hex_move_object',f.id::text,true);
   update public.adventure_map_figures set q=current_q,r=current_r where id=f.id;
   perform set_config('alea.hex_move_object','',true);
   trail=jsonb_build_array(jsonb_build_array(f.q,f.r))||(p_values->'path');
   update public.adventure_hex_state set
      spent=case when s.round_no>0 then spent||jsonb_build_object(f.id::text,used+cost) else spent end,
      trails=(trails-f.id::text)||case when straight and f.player_visible and private.adventure_trail_visible(p_map,m.campaign_id,trail)
        then jsonb_build_object(f.id::text,jsonb_build_object('until',now()+interval '8 seconds','cells',trail)) else '{}'::jsonb end
    where map_id=p_map and session_id=p_session;
   return jsonb_build_array(jsonb_build_object('id',f.id));
 else raise exception 'Kommandot passar inte aktuellt kartläge.'; end if;
 return public.read_adventure_hex(p_map,p_session,true);
end $$;
revoke all on function public.read_adventure_hex(uuid,uuid,boolean),public.command_adventure_hex(uuid,uuid,integer,text,jsonb) from public,anon;
grant execute on function public.read_adventure_hex(uuid,uuid,boolean),public.command_adventure_hex(uuid,uuid,integer,text,jsonb) to authenticated;
