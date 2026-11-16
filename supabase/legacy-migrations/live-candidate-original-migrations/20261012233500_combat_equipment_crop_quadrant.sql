-- Per-master illustration crop for the round-panel equipment art.
-- Existing items default to the currently used top-right crop.
ALTER TABLE public.rule_weapons ADD COLUMN IF NOT EXISTS combat_crop_quadrant text NOT NULL DEFAULT 'top-right';
ALTER TABLE public.rule_shields ADD COLUMN IF NOT EXISTS combat_crop_quadrant text NOT NULL DEFAULT 'top-right';
ALTER TABLE public.rule_armor_types ADD COLUMN IF NOT EXISTS combat_crop_quadrant text NOT NULL DEFAULT 'top-right';
ALTER TABLE public.rule_projectile_types ADD COLUMN IF NOT EXISTS combat_crop_quadrant text NOT NULL DEFAULT 'top-right';
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rule_weapons_crop_quadrant_ck') THEN
   ALTER TABLE public.rule_weapons ADD CONSTRAINT rule_weapons_crop_quadrant_ck
   CHECK (combat_crop_quadrant IN ('top-right','top-left','bottom-right','bottom-left','full'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rule_shields_crop_quadrant_ck') THEN
   ALTER TABLE public.rule_shields ADD CONSTRAINT rule_shields_crop_quadrant_ck
   CHECK (combat_crop_quadrant IN ('top-right','top-left','bottom-right','bottom-left','full'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rule_armor_types_crop_quadrant_ck') THEN
   ALTER TABLE public.rule_armor_types ADD CONSTRAINT rule_armor_types_crop_quadrant_ck
   CHECK (combat_crop_quadrant IN ('top-right','top-left','bottom-right','bottom-left','full'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='rule_projectile_types_crop_quadrant_ck') THEN
   ALTER TABLE public.rule_projectile_types ADD CONSTRAINT rule_projectile_types_crop_quadrant_ck
   CHECK (combat_crop_quadrant IN ('top-right','top-left','bottom-right','bottom-left','full'));
 END IF;
END $$;
