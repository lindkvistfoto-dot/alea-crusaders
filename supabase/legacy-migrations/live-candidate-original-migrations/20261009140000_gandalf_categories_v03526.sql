-- Gandalf: extend prior sound categories.
ALTER TABLE public.rule_sound_cues DROP CONSTRAINT IF EXISTS rule_sound_cues_category_check;
ALTER TABLE public.rule_sound_cues ADD CONSTRAINT rule_sound_cues_category_check
CHECK (category IN ('dice','melee','ranged','magic','ambience','creature','event'));
