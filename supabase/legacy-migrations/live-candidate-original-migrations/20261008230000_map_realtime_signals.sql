-- Alea Crusaders v0.34.95: secure, campaign-scoped map revision notifications.
-- The stream contains no map paths, location names, coordinates, GM notes or visibility details.
create table if not exists public.campaign_map_signals (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 revision bigint not null default 0 check (revision >= 0),
 updated_at timestamptz not null default now()
);
alter table public.campaign_map_signals enable row level security;
revoke all on public.campaign_map_signals from public, anon, authenticated;
grant select on public.campaign_map_signals to authenticated;
drop policy if exists campaign_map_signals_member_read on public.campaign_map_signals;
create policy campaign_map_signals_member_read
 on public.campaign_map_signals for select to authenticated
 using (
  private.is_campaign_member(campaign_id)
  or private.is_campaign_gm(campaign_id)
  or private.is_admin()
 );

create or replace function private.bump_campaign_map_signal()
returns trigger
language plpgsql security definer set search_path=''
as $map_sync$
declare v_campaign uuid;
begin
 if tg_op = 'DELETE' then
  v_campaign := old.campaign_id;
 else
  v_campaign := new.campaign_id;
 end if;
 insert into public.campaign_map_signals(campaign_id, revision)
  values (v_campaign, 1)
 on conflict (campaign_id) do update set
  revision = public.campaign_map_signals.revision + 1,
  updated_at = now();
 if tg_op = 'DELETE' then return old; end if;
 return new;
end;
$map_sync$;
revoke all on function private.bump_campaign_map_signal() from public, anon, authenticated;

drop trigger if exists map_sync_location_status on public.campaign_location_state;
create trigger map_sync_location_status
 after insert or update or delete on public.campaign_location_state
 for each row execute function private.bump_campaign_map_signal();

drop trigger if exists map_sync_maps on public.campaign_maps;
create trigger map_sync_maps
 after insert or update or delete on public.campaign_maps
 for each row execute function private.bump_campaign_map_signal();

drop trigger if exists map_sync_map_areas on public.campaign_map_areas;
create trigger map_sync_map_areas
 after insert or update or delete on public.campaign_map_areas
 for each row execute function private.bump_campaign_map_signal();

drop trigger if exists map_sync_active_map on public.campaign_map_settings;
create trigger map_sync_active_map
 after insert or update or delete on public.campaign_map_settings
 for each row execute function private.bump_campaign_map_signal();

-- Existing campaigns have a revision to read at initial join.
insert into public.campaign_map_signals (campaign_id, revision)
 select id, 0 from public.campaigns
on conflict (campaign_id) do nothing;

do $map_sync_publication$
begin
 if exists (select 1 from pg_publication where pubname='supabase_realtime')
 and not exists (
  select 1 from pg_publication_tables
  where pubname='supabase_realtime'
    and schemaname='public'
    and tablename='campaign_map_signals'
 ) then
  execute 'alter publication supabase_realtime add table public.campaign_map_signals';
 end if;
end;
$map_sync_publication$;
