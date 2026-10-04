-- Alea Crusaders – quick enemies in spontaneous combat
-- Campaign enemies remain reusable templates. Quick enemies are combat-local
-- and therefore do not need a source row in campaign_monsters.

alter table public.combatants
  alter column source_id drop not null;

alter table public.combatants
  drop constraint if exists combatants_source_check;

alter table public.combatants
  add constraint combatants_source_check
  check (
    (source_type in ('character','npc','monster') and source_id is not null)
    or (source_type='quick_enemy' and source_id is null)
  );
