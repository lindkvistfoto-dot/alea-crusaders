CREATE TABLE IF NOT EXISTS public.arcane_battlefield_library (
  object_key text PRIMARY KEY CHECK (object_key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'Objekt',
  asset_key text NOT NULL CHECK (asset_key ~ '^arcane-battlefield-[a-z0-9-]+$'),
  description text NOT NULL DEFAULT '',
  footprint jsonb NOT NULL DEFAULT '[{"q":0,"r":0}]'::jsonb CHECK (footprint = '[{"q":0,"r":0}]'::jsonb),
  connector_edges smallint[] NOT NULL DEFAULT '{}' CHECK (connector_edges <@ ARRAY[0,1,2,3,4,5]::smallint[]),
  movement_mode text NOT NULL DEFAULT 'blocked' CHECK (movement_mode IN ('free','difficult','blocked')),
  sight_mode text NOT NULL DEFAULT 'blocked' CHECK (sight_mode IN ('clear','obscuring','blocked')),
  movement_cost numeric NOT NULL DEFAULT 1 CHECK (movement_cost > 0),
  max_damage integer CHECK (max_damage IS NULL OR max_damage > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.arcane_battlefield_library ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.arcane_battlefield_library TO authenticated;

DROP POLICY IF EXISTS arcane_battlefield_library_read ON public.arcane_battlefield_library;
CREATE POLICY arcane_battlefield_library_read
  ON public.arcane_battlefield_library FOR SELECT TO authenticated
  USING (active OR private.is_admin());
DROP POLICY IF EXISTS arcane_battlefield_library_admin_write ON public.arcane_battlefield_library;
CREATE POLICY arcane_battlefield_library_admin_write
  ON public.arcane_battlefield_library FOR INSERT TO authenticated
  WITH CHECK (private.is_admin());

INSERT INTO public.arcane_battlefield_library
  (object_key,name,category,asset_key,description,footprint,connector_edges,movement_mode,sight_mode,max_damage)
VALUES
  ('wall-segment-prototype','Mursegment · prototyp','Murar','arcane-battlefield-wall-prototype',
   'Ett hexankrat mursegment. Upprepa och rotera segmentet för att bygga sammanhängande murar.',
   '[{"q":0,"r":0}]'::jsonb,ARRAY[0,3]::smallint[],'blocked','blocked',10)
ON CONFLICT (object_key) DO NOTHING;
DROP POLICY IF EXISTS arcane_battlefield_library_admin_update ON public.arcane_battlefield_library;
CREATE POLICY arcane_battlefield_library_admin_update
  ON public.arcane_battlefield_library FOR UPDATE TO authenticated
  USING (private.is_admin()) WITH CHECK (private.is_admin());

CREATE TABLE IF NOT EXISTS public.combat_battlefield_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  combat_id uuid NOT NULL REFERENCES public.combat_instances(id) ON DELETE CASCADE,
  object_key text NOT NULL REFERENCES public.arcane_battlefield_library(object_key) ON DELETE RESTRICT,
  name_snapshot text NOT NULL,
  asset_key text NOT NULL,
  q integer NOT NULL,
  r integer NOT NULL,
  rotation smallint NOT NULL DEFAULT 0 CHECK (rotation BETWEEN 0 AND 5),
  footprint jsonb NOT NULL DEFAULT '[{"q":0,"r":0}]'::jsonb,
  damage integer NOT NULL DEFAULT 0 CHECK (damage >= 0),
  max_damage integer CHECK (max_damage IS NULL OR max_damage > 0),
  visible_to_players boolean NOT NULL DEFAULT true,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combat_battlefield_objects_damage_limit CHECK (damage <= max_damage),
  CONSTRAINT combat_battlefield_objects_asset_key_check CHECK (asset_key ~ '^arcane-battlefield-[a-z0-9-]+$'),
  CONSTRAINT combat_battlefield_objects_one_per_hex UNIQUE (combat_id, q, r)
);

CREATE INDEX IF NOT EXISTS combat_battlefield_objects_campaign_combat_idx
  ON public.combat_battlefield_objects (campaign_id, combat_id, r, q);

CREATE OR REPLACE FUNCTION private.validate_combat_battlefield_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_campaign uuid;
BEGIN
  SELECT ci.campaign_id INTO v_campaign
  FROM public.combat_instances AS ci
  WHERE ci.id = NEW.combat_id;
  IF v_campaign IS NULL OR v_campaign <> NEW.campaign_id THEN
    RAISE EXCEPTION 'Battlefield object campaign must match its combat instance.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combat_battlefield_objects_validate ON public.combat_battlefield_objects;
CREATE TRIGGER combat_battlefield_objects_validate
  BEFORE INSERT OR UPDATE ON public.combat_battlefield_objects
  FOR EACH ROW EXECUTE FUNCTION private.validate_combat_battlefield_object();

CREATE OR REPLACE FUNCTION private.touch_battlefield_object_combat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_combat uuid;
BEGIN
  v_combat := CASE WHEN TG_OP = 'DELETE' THEN OLD.combat_id ELSE NEW.combat_id END;
  UPDATE public.combat_instances SET updated_at = now() WHERE id = v_combat;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS combat_battlefield_objects_touch_combat ON public.combat_battlefield_objects;
CREATE TRIGGER combat_battlefield_objects_touch_combat
  AFTER INSERT OR UPDATE OR DELETE ON public.combat_battlefield_objects
  FOR EACH ROW EXECUTE FUNCTION private.touch_battlefield_object_combat();

ALTER TABLE public.combat_battlefield_objects ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.combat_battlefield_objects TO authenticated;

DROP POLICY IF EXISTS combat_battlefield_objects_select ON public.combat_battlefield_objects;
CREATE POLICY combat_battlefield_objects_select
  ON public.combat_battlefield_objects FOR SELECT TO authenticated
  USING (
    (visible_to_players AND private.is_campaign_member(campaign_id))
    OR private.is_campaign_gm(campaign_id)
    OR private.is_admin()
  );

DROP POLICY IF EXISTS combat_battlefield_objects_insert ON public.combat_battlefield_objects;
CREATE POLICY combat_battlefield_objects_insert
  ON public.combat_battlefield_objects FOR INSERT TO authenticated
  WITH CHECK (private.is_campaign_gm(campaign_id) OR private.is_admin());

DROP POLICY IF EXISTS combat_battlefield_objects_update ON public.combat_battlefield_objects;
CREATE POLICY combat_battlefield_objects_update
  ON public.combat_battlefield_objects FOR UPDATE TO authenticated
  USING (private.is_campaign_gm(campaign_id) OR private.is_admin())
  WITH CHECK (private.is_campaign_gm(campaign_id) OR private.is_admin());

DROP POLICY IF EXISTS combat_battlefield_objects_delete ON public.combat_battlefield_objects;
CREATE POLICY combat_battlefield_objects_delete
  ON public.combat_battlefield_objects FOR DELETE TO authenticated
  USING (private.is_campaign_gm(campaign_id) OR private.is_admin());
