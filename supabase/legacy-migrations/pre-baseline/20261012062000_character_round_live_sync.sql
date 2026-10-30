-- v0.35.128 — personal round art outranks an encounter's frozen library pick.
-- Update every live instance when the source character changes its picture;
-- completed encounters remain immutable historical snapshots.
CREATE OR REPLACE FUNCTION private.sync_character_round_art_live()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  participant record;
  fallback_id uuid;
  fallback_path text;
  next_source text;
  next_path text;
  changed_instances uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Fired only when characters.round_background_path is explicitly updated.
  -- The characters RLS policy has already authorized the source edit.
  FOR participant IN
    SELECT cb.id,cb.combat_id,coalesce(cb.state,'{}'::jsonb) as state
    FROM public.combatants cb
    JOIN public.combat_instances ci ON ci.id=cb.combat_id
    WHERE cb.source_type='character'
      AND cb.source_id=NEW.id
      AND cb.campaign_id=NEW.campaign_id
      AND ci.campaign_id=NEW.campaign_id
      AND ci.status IN ('active','setup','paused')
  LOOP
    fallback_id:=NULL;
    fallback_path:=NULL;
    -- Keep the old fallback selection (even if now disabled in admin).
    SELECT bg.id,bg.image_path INTO fallback_id,fallback_path
    FROM public.rule_combat_round_backgrounds bg
    WHERE bg.id::text=participant.state->>'round_background_id'
      AND bg.archived_at IS NULL
    LIMIT 1;

    IF fallback_path IS NULL THEN
      -- Choose a stable fallback once, independently per combatant.
      SELECT bg.id,bg.image_path INTO fallback_id,fallback_path
      FROM public.rule_combat_round_backgrounds bg
      WHERE bg.is_active AND bg.archived_at IS NULL
      ORDER BY md5(participant.id::text||bg.id::text)
      LIMIT 1;
    END IF;

    next_source:=CASE WHEN NEW.round_background_path IS NULL THEN 'library' ELSE 'character' END;
    next_path:=coalesce(NEW.round_background_path,fallback_path,'assets/combat/round-hero-battle-pilot.avif');

    UPDATE public.combatants cb
    SET state=coalesce(cb.state,'{}'::jsonb)||jsonb_build_object(
      'round_background_source',next_source,
      'round_background_path',next_path,
      'round_background_id',fallback_id
    ),updated_at=clock_timestamp()
    WHERE cb.id=participant.id
      AND (
        cb.state->>'round_background_source' IS DISTINCT FROM next_source OR
        cb.state->>'round_background_path' IS DISTINCT FROM next_path OR
        cb.state->>'round_background_id' IS DISTINCT FROM fallback_id::text
      );

    IF FOUND THEN
      changed_instances:=array_append(changed_instances,participant.combat_id);
    END IF;
  END LOOP;

  -- Polling clients watch the instance timestamp, not individual combatant rows.
  IF array_length(changed_instances,1)>0 THEN
    UPDATE public.combat_instances ci
    SET updated_at=clock_timestamp()
    WHERE ci.id=ANY(changed_instances)
      AND ci.status IN ('active','setup','paused');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.sync_character_round_art_live() FROM PUBLIC,anon,authenticated;

DROP TRIGGER IF EXISTS characters_round_art_live_sync ON public.characters;
CREATE TRIGGER characters_round_art_live_sync
AFTER UPDATE OF round_background_path ON public.characters
FOR EACH ROW EXECUTE FUNCTION private.sync_character_round_art_live();

-- Repair image choices in combats started before a personal image was
-- uploaded (e.g. Lyra), without changing turn order, HP or other state.
-- Updating the column with its existing value deliberately fires the trigger.
UPDATE public.characters c
SET round_background_path=c.round_background_path
WHERE EXISTS(
 SELECT 1
 FROM public.combatants cb
 JOIN public.combat_instances ci ON ci.id=cb.combat_id
 WHERE cb.source_type='character'
   AND cb.source_id=c.id
   AND cb.campaign_id=c.campaign_id
   AND ci.status IN ('active','setup','paused')
   AND (
      (c.round_background_path IS NOT NULL AND (
        cb.state->>'round_background_source' IS DISTINCT FROM 'character'
        OR cb.state->>'round_background_path' IS DISTINCT FROM c.round_background_path
      ))
      OR (c.round_background_path IS NULL
          AND cb.state->>'round_background_source'='character')
   )
);
