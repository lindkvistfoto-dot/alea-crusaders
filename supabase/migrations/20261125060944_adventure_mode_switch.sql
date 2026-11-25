alter table public.adventure_hex_state add column paused_round integer not null default 0 check (paused_round>=0 and (paused_round=0 or round_no=0));

create or replace function public.command_adventure_hex(p_map uuid,p_session uuid,p_epoch integer,p_action text,p_values jsonb)
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
 if p_action='pause' and s.round_no>0 then
   update public.adventure_hex_state set paused_round=round_no,round_no=0,epoch=epoch+1
    where map_id=p_map and session_id=p_session;
 elsif p_action='begin' and s.paused_round>0 then
   update public.adventure_hex_state set round_no=paused_round,paused_round=0,epoch=epoch+1
    where map_id=p_map and session_id=p_session;
 elsif (p_action='begin' and s.round_no=0) or (p_action in ('round','end') and s.round_no>0) then
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
