-- Alea Crusaders – keep event combat templates inside one campaign
-- Prevent a combat template from combining an event or map from another campaign.

alter table public.campaign_event_combats
  drop constraint if exists campaign_event_combats_event_campaign_fkey;

alter table public.campaign_event_combats
  add constraint campaign_event_combats_event_campaign_fkey
  foreign key (event_id,campaign_id)
  references public.campaign_events(id,campaign_id)
  on delete cascade;

alter table public.campaign_event_combats
  drop constraint if exists campaign_event_combats_map_campaign_fkey;

alter table public.campaign_event_combats
  add constraint campaign_event_combats_map_campaign_fkey
  foreign key (map_id,campaign_id)
  references public.campaign_maps(id,campaign_id)
  on delete set null (map_id);

create index if not exists campaign_event_combats_event_campaign_idx
  on public.campaign_event_combats(event_id,campaign_id);

create index if not exists campaign_event_combats_map_campaign_idx
  on public.campaign_event_combats(map_id,campaign_id);
