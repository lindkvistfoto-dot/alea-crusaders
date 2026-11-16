alter table public.campaign_combat_scene_combatants
  add column if not exists start_q integer,
  add column if not exists start_r integer;

alter table public.campaign_combat_scene_combatants
  drop constraint if exists campaign_combat_scene_combatants_start_hex_pair;

alter table public.campaign_combat_scene_combatants
  add constraint campaign_combat_scene_combatants_start_hex_pair
  check ((start_q is null and start_r is null) or (start_q is not null and start_r is not null));

create unique index if not exists campaign_combat_scene_combatants_one_per_start_hex
  on public.campaign_combat_scene_combatants(scene_id,start_q,start_r)
  where start_q is not null and start_r is not null;
