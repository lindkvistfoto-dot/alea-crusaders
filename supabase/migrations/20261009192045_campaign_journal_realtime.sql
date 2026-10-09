-- v0.35.33 – durable campaign journal (applied to Supabase 2026-10-09).
create table if not exists public.campaign_journal_entries (
 id uuid primary key default gen_random_uuid(),
 campaign_id uuid not null references public.campaigns(id) on delete cascade,
 event_type text not null check (event_type in ('skill','spell','dice','combat','day','note')),
 title text not null check (char_length(title) between 1 and 180),
 message text not null default '',
 actor_name text not null default '',
 outcome text not null default '',
 details jsonb not null default '{}'::jsonb,
 player_visible boolean not null default true,
 created_by uuid default auth.uid(),
 source_key text unique,
 created_at timestamptz not null default now()
);
create index if not exists campaign_journal_recent_idx
 on public.campaign_journal_entries(campaign_id,created_at desc,id desc);
alter table public.campaign_journal_entries enable row level security;
grant select,insert on public.campaign_journal_entries to authenticated;
drop policy if exists journal_read on public.campaign_journal_entries;
create policy journal_read on public.campaign_journal_entries for select to authenticated
 using ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id))
     or (player_visible and (select private.is_campaign_member(campaign_id))));
drop policy if exists journal_insert on public.campaign_journal_entries;
create policy journal_insert on public.campaign_journal_entries for insert to authenticated
 with check (created_by=(select auth.uid()) and source_key is null
 and ((select private.is_admin()) or (select private.is_campaign_gm(campaign_id))
 or (event_type in ('skill','spell','dice') and player_visible and
     (select private.is_campaign_member(campaign_id)))));

create or replace function private.append_combat_to_journal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.campaign_journal_entries
 (campaign_id,event_type,title,message,actor_name,outcome,details,player_visible,created_by,source_key,created_at)
 values (new.campaign_id,'combat',
 case when new.phase='magic' then 'Magi i strid'
      when new.phase='attack' then 'Attack i strid'
      when new.phase='damage' then 'Skada i strid'
      when new.phase='initiative' then 'Initiativ'
      else 'Strid · '||coalesce(new.phase,'händelse') end,
 coalesce(new.message,''),'','',
 coalesce(new.details,'{}'::jsonb)||jsonb_build_object(
 'combat_id',new.combat_id,'combat_log_id',new.id,'round',new.round_number,'event_type',new.event_type),
 coalesce(new.player_visible,true),null,'combat:'||new.id::text,new.created_at)
 on conflict (source_key) do nothing;
 return new;
end $$;
revoke all on function private.append_combat_to_journal() from public,anon,authenticated;
drop trigger if exists campaign_journal_combat_trigger on public.combat_log;
create trigger campaign_journal_combat_trigger after insert on public.combat_log
 for each row execute function private.append_combat_to_journal();

create or replace function private.append_day_to_journal()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.campaign_journal_entries
 (campaign_id,event_type,title,message,actor_name,details,player_visible,created_by,source_key,created_at)
 values (new.campaign_id,'day','Dag '||new.day_number||' inleds',
 case when coalesce(new.with_rest,false) then 'Ny dag efter vila'
      else 'Ny dag utan vila' end||
 case when coalesce(new.weather,'')<>'' then ' · Väder: '||new.weather else '' end,
 '',jsonb_build_object('day_number',new.day_number,'rest_hours',new.rest_hours,'weather',new.weather),
 true,null,'day:'||new.id::text,new.started_at)
 on conflict(source_key) do nothing;
 return new;
end $$;
revoke all on function private.append_day_to_journal() from public,anon,authenticated;
drop trigger if exists campaign_journal_day_trigger on public.campaign_day_history;
create trigger campaign_journal_day_trigger after insert on public.campaign_day_history
 for each row execute function private.append_day_to_journal();

insert into public.campaign_journal_entries
(campaign_id,event_type,title,message,details,player_visible,created_by,source_key,created_at)
select campaign_id,'combat',
 case when phase='magic' then 'Magi i strid' when phase='attack' then 'Attack i strid'
      when phase='damage' then 'Skada i strid' when phase='initiative' then 'Initiativ'
      else 'Strid · '||coalesce(phase,'händelse') end,
 coalesce(message,''),coalesce(details,'{}'::jsonb)||
 jsonb_build_object('combat_id',combat_id,'combat_log_id',id,'round',round_number,'event_type',event_type),
 coalesce(player_visible,true),null,'combat:'||id::text,created_at
from public.combat_log on conflict(source_key) do nothing;

insert into public.campaign_journal_entries
(campaign_id,event_type,title,message,details,player_visible,created_by,source_key,created_at)
select campaign_id,'day','Dag '||day_number||' inleds',
 'Väder: '||coalesce(nullif(weather,''),'ej angivet'),
 jsonb_build_object('day_number',day_number,'rest_hours',rest_hours),
 true,null,'day:'||id::text,started_at
from public.campaign_day_history on conflict(source_key) do nothing;
alter publication supabase_realtime add table public.campaign_journal_entries;
