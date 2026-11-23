-- The existing campaign map setting remains authoritative across reconnects.
create function public.set_shared_current_map(p_campaign_id uuid,p_map_id uuid)
returns table(campaign_id uuid,active_map_id uuid)
language plpgsql security invoker set search_path='' as $$
begin
 if not (private.is_campaign_gm(p_campaign_id) or private.is_admin()) then
  raise exception 'Endast SL kan välja aktuell karta.' using errcode='42501';
 end if;
 update public.campaign_maps m set player_visible=true,first_activated_at=coalesce(m.first_activated_at,now()),last_activated_at=now()
 where m.id=p_map_id and m.campaign_id=p_campaign_id;
 if not found then raise exception 'Kartan finns inte i kampanjen.'; end if;
 return query insert into public.campaign_map_settings as settings(campaign_id,active_map_id,updated_by)
 values(p_campaign_id,p_map_id,auth.uid()) on conflict on constraint campaign_map_settings_pkey
 do update set active_map_id=excluded.active_map_id,updated_by=excluded.updated_by
 returning settings.campaign_id,settings.active_map_id;
end $$;

-- Removing access to the current map also removes it as a destination.
create function private.clear_unshared_current_map() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 update public.campaign_map_settings set active_map_id=null,updated_by=auth.uid()
 where campaign_id=new.campaign_id and active_map_id=new.id;
 return new;
end $$;
create trigger clear_unshared_current_map after update of player_visible on public.campaign_maps
 for each row when(old.player_visible and not new.player_visible) execute function private.clear_unshared_current_map();

-- A roster entry is a character; a connected player is the character's owner.
create function private.gather_session_allowed(p_session uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.game_sessions s where s.id=p_session and s.status='active' and (
   private.is_campaign_gm(s.campaign_id) or private.is_admin() or
   (private.is_campaign_member(s.campaign_id) and exists(
    select 1 from public.game_session_participants p join public.characters c
     on c.id=p.character_id and c.campaign_id=p.campaign_id
    where p.session_id=s.id and p.campaign_id=s.campaign_id and p.left_at is null
     and p.participant_kind='player' and c.owner_id=auth.uid()))))
$$;
create function public.read_gather_session(p_campaign_id uuid) returns uuid
language sql stable security invoker set search_path='' as $$
 select s.id from public.game_sessions s where s.campaign_id=p_campaign_id and s.status='active'
 and private.gather_session_allowed(s.id)
$$;
create function private.can_join_gather_topic(p_topic text) returns boolean
language sql stable security invoker set search_path='' as $$
 select case when p_topic ~ '^gather:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 then private.gather_session_allowed(substr(p_topic,8)::uuid) else false end
$$;
create policy gather_receive on realtime.messages for select to authenticated
 using(extension in ('broadcast','presence') and private.can_join_gather_topic((select realtime.topic())));
create policy gather_attendance on realtime.messages for insert to authenticated
 with check(extension='presence' and private.can_join_gather_topic((select realtime.topic())));

-- Only this server-side operation emits navigation. Clients may track presence.
create function private.send_session_gather(p_campaign_id uuid,p_session_id uuid,p_view text,p_target_id uuid,p_command_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not(private.is_campaign_gm(p_campaign_id) or private.is_admin()) then
  raise exception 'Endast SL kan samla spelarna.' using errcode='42501';
 end if;
 perform 1 from public.game_sessions where id=p_session_id and campaign_id=p_campaign_id and status='active' for share;
 if not found then raise exception 'Ett pågående spelmöte krävs.'; end if;
 if p_view='map' then
  perform 1 from public.campaign_map_settings s join public.campaign_maps m
   on m.id=s.active_map_id and m.campaign_id=s.campaign_id where s.campaign_id=p_campaign_id
   and m.id=p_target_id and m.player_visible for share of s,m;
 elsif p_view='image' then
  perform 1 from public.campaign_materials m where m.id=p_target_id and m.campaign_id=p_campaign_id
   and m.archived_at is null and m.asset_kind='image' and exists(
    select 1 from public.campaign_material_presentation_history h where h.campaign_id=m.campaign_id and h.material_id=m.id)
   for share of m;
 else raise exception 'Okänd vy.';
 end if;
 if not found or p_command_id is null then raise exception 'Målet är inte delat med spelarna.'; end if;
 perform realtime.send(jsonb_build_object('id',p_command_id,'view',p_view,'target',p_target_id),
  'gather','gather:'||p_session_id,true);
 return p_command_id;
end $$;
create function public.send_session_gather(p_campaign_id uuid,p_session_id uuid,p_view text,p_target_id uuid,p_command_id uuid)
returns uuid language sql security invoker set search_path='' as $$
 select private.send_session_gather(p_campaign_id,p_session_id,p_view,p_target_id,p_command_id)
$$;
revoke all on function private.clear_unshared_current_map() from public,anon,authenticated;
revoke all on function public.set_shared_current_map(uuid,uuid),private.gather_session_allowed(uuid),
 private.can_join_gather_topic(text),public.read_gather_session(uuid),private.send_session_gather(uuid,uuid,text,uuid,uuid),
 public.send_session_gather(uuid,uuid,text,uuid,uuid) from public,anon;
grant execute on function public.set_shared_current_map(uuid,uuid),private.gather_session_allowed(uuid),
 private.can_join_gather_topic(text),public.read_gather_session(uuid),private.send_session_gather(uuid,uuid,text,uuid,uuid),
 public.send_session_gather(uuid,uuid,text,uuid,uuid) to authenticated;

-- Wake already logged-in clients as the SL starts, resumes or edits a meeting.
create trigger gather_session_change after insert or update of status or delete on public.game_sessions
 for each row execute function private.bump_campaign_map_signal();
create trigger gather_roster_change after insert or update or delete on public.game_session_participants
 for each row execute function private.bump_campaign_map_signal();
