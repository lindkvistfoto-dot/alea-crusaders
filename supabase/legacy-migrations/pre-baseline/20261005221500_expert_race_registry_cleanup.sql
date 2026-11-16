-- Keep the central race registry aligned with the Drakar och Demoner Expert ruleset.
-- Halvalv and Halvorch were accidentally added from the 1991 rules and do not
-- belong in the Expert registry used by Alea Crusaders.
--
-- rule_race_attributes rows are removed automatically through ON DELETE CASCADE.

delete from public.rule_races
where id in ('halvalv', 'halvorch');
