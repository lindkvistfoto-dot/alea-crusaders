-- Alea Crusaders – promote combat scenes to campaign-level content
-- Existing scenes, hex terrain and participants are preserved.
-- The former event ownership becomes an optional historical source link.

alter table public.campaign_event_combat_scenes
  rename to campaign_combat_scenes;

alter table public.campaign_event_combat_scene_hexes
  rename to campaign_combat_scene_hexes;

alter table public.campaign_event_combat_scene_characters
  rename to campaign_combat_scene_characters;

alter table public.campaign_event_combat_scene_npcs
  rename to campaign_combat_scene_npcs;

alter table public.campaign_event_combat_scene_monsters
  rename to campaign_combat_scene_monsters;

alter table public.campaign_combat_scenes
  rename column event_id to source_event_id;

alter table public.campaign_combat_scenes
  alter column source_event_id drop not null;

alter table public.campaign_combat_scenes
  drop constraint if exists campaign_event_combat_scenes_event_campaign_fkey;

alter table public.campaign_combat_scenes
  drop constraint if exists campaign_event_combat_scenes_event_id_fkey;

alter table public.campaign_combat_scenes
  add constraint campaign_combat_scenes_source_event_fkey
  foreign key (source_event_id)
  references public.campaign_events(id)
  on delete set null;

comment on column public.campaign_combat_scenes.source_event_id is
  'Optional historical/source event. Combat scenes are owned by the campaign, not by an event.';
