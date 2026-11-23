-- A campaign deletion also cascades through sessions, roster entries and maps.
-- Emit revisions only for campaigns that can still have subscribers.
create or replace function private.bump_campaign_map_signal()
returns trigger language plpgsql security definer set search_path='' as $$
declare campaign uuid;
begin
 if tg_op='DELETE' then campaign=old.campaign_id; else campaign=new.campaign_id; end if;
 insert into public.campaign_map_signals(campaign_id,revision)
 select c.id,1 from public.campaigns c where c.id=campaign
 on conflict(campaign_id) do update set revision=public.campaign_map_signals.revision+1,updated_at=now();
 if tg_op='DELETE' then return old; end if;
 return new;
end $$;
