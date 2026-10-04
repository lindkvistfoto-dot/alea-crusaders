-- Alea Crusaders – strengthen location ↔ event links
-- A linked event can have one primary location plus any number of related locations.
-- Composite foreign keys ensure both sides belong to the same campaign.

alter table public.campaign_location_event_links
  drop constraint if exists campaign_location_event_links_relation_kind_check;

alter table public.campaign_location_event_links
  add constraint campaign_location_event_links_relation_kind_check
  check (relation_kind in ('primary','related'));

create unique index if not exists campaign_location_event_links_one_primary_per_event
  on public.campaign_location_event_links(event_id)
  where relation_kind='primary';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.campaign_events'::regclass
      and conname='campaign_events_id_campaign_id_key'
  ) then
    alter table public.campaign_events
      add constraint campaign_events_id_campaign_id_key unique (id,campaign_id);
  end if;
end
$$;

alter table public.campaign_location_event_links
  drop constraint if exists campaign_location_event_links_location_campaign_fkey;

alter table public.campaign_location_event_links
  add constraint campaign_location_event_links_location_campaign_fkey
  foreign key (location_id,campaign_id)
  references public.campaign_locations(id,campaign_id)
  on delete cascade;

alter table public.campaign_location_event_links
  drop constraint if exists campaign_location_event_links_event_campaign_fkey;

alter table public.campaign_location_event_links
  add constraint campaign_location_event_links_event_campaign_fkey
  foreign key (event_id,campaign_id)
  references public.campaign_events(id,campaign_id)
  on delete cascade;


create index if not exists campaign_location_event_links_campaign_idx
  on public.campaign_location_event_links(campaign_id);

create index if not exists campaign_location_event_links_event_campaign_idx
  on public.campaign_location_event_links(event_id,campaign_id);

create index if not exists campaign_location_event_links_location_campaign_idx
  on public.campaign_location_event_links(location_id,campaign_id);
