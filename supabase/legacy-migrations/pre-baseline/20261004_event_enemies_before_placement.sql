-- Alea Crusaders – campaign enemies can be assigned to an event before placement
-- q/r remain null until the event's combat setup places the enemy on the hex map.

alter table public.campaign_event_combat_spawns
  alter column q drop not null,
  alter column r drop not null;

alter table public.campaign_event_combat_spawns
  drop constraint if exists campaign_event_combat_spawns_position_check;

alter table public.campaign_event_combat_spawns
  add constraint campaign_event_combat_spawns_position_check
  check ((q is null and r is null) or (q is not null and r is not null));
