-- No presentation history. A private live packet contains only a random command,
-- its mode and a one-use fingerprint. All image metadata is read under player RLS.
create function private.gallery_picture(p_campaign uuid,p_source text,p_picture uuid)
returns table(id uuid,source text,location_id uuid,title text,storage_bucket text,storage_path text,player_visible boolean)
language sql stable security invoker set search_path='' as $$
 select a.id,'legacy'::text,a.location_id,a.title,'campaign-location-assets'::text,a.storage_path,a.player_visible
 from public.campaign_location_assets a where p_source='legacy' and a.campaign_id=p_campaign and (p_picture is null or a.id=p_picture) and a.asset_type='image'
 union all
 select l.id,'library'::text,l.object_id,i.title,i.storage_bucket,i.storage_path,l.player_visible
 from public.campaign_image_links l join public.campaign_images i on i.id=l.image_id and i.campaign_id=l.campaign_id
 where p_source='library' and l.campaign_id=p_campaign and (p_picture is null or l.id=p_picture) and l.object_type='place'
$$;
create function public.read_arcane_gallery_image(p_campaign uuid,p_source text,p_picture uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(p) from private.gallery_picture(p_campaign,p_source,p_picture) p
 where p_picture is not null and p.player_visible and private.adventure_location_shared(p.location_id,p_campaign)
$$;


create function private.emit_arcane_reveal(p_campaign uuid,p_session uuid,p_source text,p_picture uuid,p_mode text,p_command uuid)
returns void language plpgsql security definer set search_path='' as $$
declare fingerprint text;
begin
 if auth.uid() is null or not (private.is_campaign_gm(p_campaign) or private.is_admin()) then raise insufficient_privilege;end if;
 perform 1 from public.game_sessions where id=p_session and campaign_id=p_campaign and status='active' for share;
 if not found then raise exception 'Spelmötet har avslutats.';end if;
 if p_mode in ('full','frame') then
  perform 1 from private.gallery_picture(p_campaign,p_source,p_picture) p where p.player_visible and exists(
    select 1 from public.campaign_map_areas a join public.campaign_maps m on m.id=a.map_id and m.campaign_id=a.campaign_id and m.player_visible
    join public.campaign_location_state s on s.campaign_id=a.campaign_id and s.location_id=a.location_id and s.status='explored'
    where a.campaign_id=p_campaign and a.location_id=p.location_id);
  if not found then raise exception 'Bilden är inte tillgänglig för spelarna.';end if;
  fingerprint:=encode(sha256(convert_to(p_command::text||p_source||p_picture::text,'UTF8')),'hex');
 elsif p_mode is distinct from 'refresh' then raise exception 'Ogiltigt presentationsläge.';
 end if;
 perform realtime.send(jsonb_build_object('id',p_command,'mode',p_mode,'ref',fingerprint),'arcane-reveal','gather:'||p_session,true);
end $$;

create function public.command_arcane_reveal(p_campaign uuid,p_source text,p_picture uuid,p_action text,p_command uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare pic record; meeting uuid; delivery text:='refresh'; desired boolean;
begin
 if auth.uid() is null or not (private.is_campaign_gm(p_campaign) or private.is_admin()) then
  raise exception 'Endast SL får dela eller presentera platsbilder.' using errcode='42501';
 end if;
 if p_picture is null or p_command is null or p_action is null or p_action not in ('share','revoke','frame','full') then raise exception 'Ogiltig bildåtgärd.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_campaign::text,0));
 select * into pic from private.gallery_picture(p_campaign,p_source,p_picture);
 if not found then raise exception 'Platsbilden kunde inte hittas.';end if;
 if p_action<>'revoke' and not exists (
  select 1 from public.campaign_map_areas a join public.campaign_maps m on m.id=a.map_id and m.campaign_id=a.campaign_id and m.player_visible
  join public.campaign_location_state s on s.campaign_id=a.campaign_id and s.location_id=a.location_id and s.status='explored'
  where a.campaign_id=p_campaign and a.location_id=pic.location_id
 ) then raise exception 'Visa platsen som utforskad på en delad karta innan bilden visas för spelarna.';end if;
 select id into meeting from public.game_sessions where campaign_id=p_campaign and status='active' ;
 if p_action in ('share','revoke') then
  desired:=p_action='share';
  -- A converted legacy picture can have two references for the same room/file.
  if desired and not pic.player_visible then delivery:='full';end if;
  update public.campaign_location_assets a set player_visible=desired
  where pic.storage_bucket='campaign-location-assets' and a.campaign_id=p_campaign and a.location_id=pic.location_id
    and a.asset_type='image' and a.storage_path=pic.storage_path and a.player_visible<>desired;
  update public.campaign_image_links l set player_visible=desired from public.campaign_images i
  where l.image_id=i.id and l.campaign_id=i.campaign_id and l.campaign_id=p_campaign and l.object_type='place'
   and l.object_id=pic.location_id and i.storage_bucket=pic.storage_bucket and i.storage_path=pic.storage_path and l.player_visible<>desired;
 else
  if not pic.player_visible then raise exception 'Dela bilden innan den presenteras.';end if;
  if meeting is null then raise exception 'Starta ett spelmöte för att presentera bilden.';end if;
  delivery:=p_action;
 end if;

 if meeting is not null then perform private.emit_arcane_reveal(p_campaign,meeting,p_source,p_picture,delivery,p_command);end if;
 return jsonb_build_object('mode',delivery,'session',meeting);
end $$;

create function public.read_arcane_reveal(p_session uuid,p_command uuid,p_ref text)
returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(p) from public.game_sessions s
 cross join (values ('legacy'),('library')) as kinds(source)
 cross join lateral private.gallery_picture(s.campaign_id,kinds.source,null) p
 where s.id=p_session and s.status='active' and private.gather_session_allowed(s.id)
 and p.player_visible and private.adventure_location_shared(p.location_id,s.campaign_id)
 and encode(sha256(convert_to(p_command::text||p.source||p.id::text,'UTF8')),'hex')=p_ref
 limit 1
$$;
revoke all on function private.gallery_picture(uuid,text,uuid),public.read_arcane_gallery_image(uuid,text,uuid),
 private.emit_arcane_reveal(uuid,uuid,text,uuid,text,uuid),public.command_arcane_reveal(uuid,text,uuid,text,uuid),
 public.read_arcane_reveal(uuid,uuid,text) from public,anon;
grant execute on function private.gallery_picture(uuid,text,uuid),public.read_arcane_gallery_image(uuid,text,uuid),
 private.emit_arcane_reveal(uuid,uuid,text,uuid,text,uuid),public.command_arcane_reveal(uuid,text,uuid,text,uuid),
 public.read_arcane_reveal(uuid,uuid,text) to authenticated;
