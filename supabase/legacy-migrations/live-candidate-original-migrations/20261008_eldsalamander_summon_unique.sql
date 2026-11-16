-- Summoned creature = one combatant per successfully resolved casting action.
-- Prevent races/double-clicks creating duplicate salamanders in one battle.
create unique index if not exists combatants_summon_action_once_idx
 on public.combatants(combat_id,source_instance_key)
 where source_instance_key like 'summon:%';
