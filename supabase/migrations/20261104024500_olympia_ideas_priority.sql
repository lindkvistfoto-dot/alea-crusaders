-- Priority is Zeus's manual ordering of UPPSLAG ideas.
ALTER TABLE public.olympia_ideas ADD COLUMN IF NOT EXISTS priority smallint NOT NULL DEFAULT 2;
ALTER TABLE public.olympia_ideas DROP CONSTRAINT IF EXISTS olympia_ideas_priority_check;
ALTER TABLE public.olympia_ideas ADD CONSTRAINT olympia_ideas_priority_check CHECK (priority BETWEEN 1 AND 3);
