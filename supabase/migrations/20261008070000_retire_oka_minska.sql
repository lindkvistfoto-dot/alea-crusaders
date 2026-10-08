-- Retire two spells whose Expert scaling has not been verified.
DELETE FROM public.rule_effects WHERE code IN ('spell_oka','spell_minska');
DELETE FROM public.rule_spells WHERE spell_key IN ('oka','minska');
