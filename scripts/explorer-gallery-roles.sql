-- DEV acceptance. Submit the entire transaction together. All example records and events roll back.
begin;
do $$
declare
 campaign uuid; meeting uuid; gm uuid; player uuid; place uuid; img uuid:=gen_random_uuid(); legacy uuid:=gen_random_uuid();
 link uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); cmd uuid:=gen_random_uuid(); path text;
 fingerprint text; result jsonb; packet jsonb;
begin
 select s.id,s.campaign_id,c.owner_id into strict meeting,campaign,player
 from public.game_sessions s join public.game_session_participants p on p.session_id=s.id and p.campaign_id=s.campaign_id
 join public.characters c on c.id=p.character_id join public.profiles pr on pr.id=c.owner_id
 join public.campaign_members cm on cm.user_id=c.owner_id and cm.campaign_id=s.campaign_id
 where s.status='active' and p.left_at is null and p.participant_kind='player' and not pr.is_admin and cm.role='player' limit 1;
 select user_id into strict gm from public.campaign_members where campaign_id=campaign and role='gm' limit 1;
 select a.location_id into strict place from public.campaign_map_areas a join public.campaign_maps m on m.id=a.map_id
 join public.campaign_location_state st on st.campaign_id=a.campaign_id and st.location_id=a.location_id
 where a.campaign_id=campaign and m.player_visible and st.status='explored' limit 1;
 path:=campaign::text||'/gallery-test-'||img::text||'.webp';
 insert into public.campaign_images(id,campaign_id,storage_path,title) values(img,campaign,path,'ARCANE test');
 insert into public.campaign_image_links(id,campaign_id,image_id,object_type,object_id) values(link,campaign,img,'place',place);
 insert into public.campaign_location_assets(id,campaign_id,location_id,title,storage_path,asset_type)
 values(legacy,campaign,place,'ARCANE test',path,'image'),(other,campaign,place,'Private test',path||'2','image');
 insert into storage.objects(bucket_id,name) values('campaign-location-assets',path);
 perform set_config('request.jwt.claim.sub',player::text,true);
 execute 'set local role authenticated';
 if private.is_admin() or not private.gather_session_allowed(meeting) or private.is_campaign_gm(campaign) then raise exception 'Wrong fixture role';end if;
 if exists(select 1 from public.campaign_location_assets where id in (legacy,other)) or exists(select 1 from public.campaign_images where id=img)
  or exists(select 1 from storage.objects where name=path) then raise exception 'Hidden image was returned';end if;
 begin
  perform public.command_arcane_reveal(campaign,'legacy',legacy,'share',cmd);raise exception 'Player could share';
 exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',gm::text,true);
 select public.command_arcane_reveal(campaign,'library',link,'share',cmd) into result;
 if result->>'mode'<>'full' or result->>'session'<>meeting::text then raise exception 'First share failed';end if;
 execute 'reset role';
 select payload into strict packet from realtime.messages where event='arcane-reveal' and payload->>'id'=cmd::text order by inserted_at desc limit 1;
 if packet - 'id' - 'mode' - 'ref' <> '{}'::jsonb or packet::text like '%'||link::text||'%' then raise exception 'Unexpected event fields';end if;
 fingerprint:=packet->>'ref';
 perform set_config('request.jwt.claim.sub',player::text,true);execute 'set local role authenticated';
 result:=public.read_arcane_reveal(meeting,cmd,fingerprint);
 if result is null or result->>'id'<>link::text or result->>'storage_path'<>path then raise exception 'Authorized reveal failed';end if;
 if not exists(select 1 from storage.objects where name=path) or exists(select 1 from public.campaign_location_assets where id=other) then raise exception 'Storage or sibling visibility wrong';end if;
 if public.read_arcane_reveal(gen_random_uuid(),cmd,fingerprint) is not null then raise exception 'Wrong meeting accepted';end if;
 perform set_config('request.jwt.claim.sub',gm::text,true);
 if public.command_arcane_reveal(campaign,'legacy',legacy,'share',gen_random_uuid())->>'mode'<>'refresh' then raise exception 'Repeated share republished';end if;
 if public.command_arcane_reveal(campaign,'library',link,'frame',gen_random_uuid())->>'mode'<>'frame' then raise exception 'Frame failed';end if;
 if public.command_arcane_reveal(campaign,'library',link,'full',gen_random_uuid())->>'mode'<>'full' then raise exception 'Fullscreen failed';end if;
 perform public.command_arcane_reveal(campaign,'library',link,'revoke',gen_random_uuid());
 perform set_config('request.jwt.claim.sub',player::text,true);
 if public.read_arcane_reveal(meeting,cmd,fingerprint) is not null or exists(select 1 from storage.objects where name=path)
  or exists(select 1 from public.campaign_location_assets where id=legacy) then raise exception 'Revoked image remained accessible';end if;
end $$;
select 'PASS: hidden and authorized metadata/storage, both aliases, players and GM, live send, frame/full, wrong session and revocation' as result;
rollback;
