-- Commit the weapon hand loadout, its primary action cost, and the combat log
-- as one transaction. A repeated or stale confirmation cannot spend the action twice.
CREATE OR REPLACE FUNCTION public.combat_commit_weapon_switch(
  p_combat_id uuid,
  p_combatant_id uuid,
  p_action_id uuid,
  p_character_id uuid,
  p_round_number integer,
  p_left_hand jsonb,
  p_right_hand jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_combat record;
  v_actor record;
  v_action record;
  v_character record;
  v_old_equipment jsonb;
  v_new_equipment jsonb;
  v_now timestamptz := clock_timestamp();
  v_log_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_round_number IS NULL OR p_round_number < 1
     OR (p_left_hand IS NOT NULL AND jsonb_typeof(p_left_hand) <> 'object')
     OR (p_right_hand IS NOT NULL AND jsonb_typeof(p_right_hand) <> 'object') THEN
    RAISE EXCEPTION 'Invalid weapon loadout';
  END IF;

  SELECT ci.* INTO v_combat
  FROM public.combat_instances AS ci
  WHERE ci.id = p_combat_id
  FOR UPDATE;
  IF NOT FOUND OR v_combat.status <> 'active'
     OR v_combat.round_number <> p_round_number
     OR v_combat.active_actor_id <> p_combatant_id THEN
    RAISE EXCEPTION 'Combat turn has changed';
  END IF;
  IF NOT (private.is_admin() OR private.is_campaign_gm(v_combat.campaign_id)) THEN
    RAISE EXCEPTION 'Only the combat GM may confirm this action';
  END IF;

  SELECT cb.* INTO v_actor
  FROM public.combatants AS cb
  WHERE cb.id = p_combatant_id
    AND cb.combat_id = p_combat_id
    AND cb.campaign_id = v_combat.campaign_id
    AND cb.source_type = 'character'
    AND cb.source_id = p_character_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Combatant does not match the character';
  END IF;

  SELECT ca.* INTO v_action
  FROM public.combat_actions AS ca
  WHERE ca.id = p_action_id
    AND ca.combat_id = p_combat_id
    AND ca.campaign_id = v_combat.campaign_id
    AND ca.combatant_id = p_combatant_id
    AND ca.round_number = p_round_number
    AND ca.slot_key = 'primary'
    AND ca.status = 'planned'
    AND ca.source_data ->> 'action_key' = 'weapon_switch'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Weapon switch action is no longer available';
  END IF;

  SELECT ch.* INTO v_character
  FROM public.characters AS ch
  WHERE ch.id = p_character_id
    AND ch.campaign_id = v_combat.campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Character does not belong to this combat campaign';
  END IF;

  v_old_equipment := coalesce(v_character.data -> 'currentEquipment', '{}'::jsonb);
  v_new_equipment := v_old_equipment || jsonb_build_object(
    'leftHand', p_left_hand,
    'rightHand', p_right_hand
  );

  UPDATE public.characters
  SET data = jsonb_set(coalesce(data, '{}'::jsonb), '{currentEquipment}', v_new_equipment, true)
  WHERE id = p_character_id;

  UPDATE public.combat_actions
  SET status = 'resolved',
      result = coalesce(result, '{}'::jsonb) || jsonb_build_object(
        'weapon_switch', true,
        'old_loadout', jsonb_build_object('leftHand', v_old_equipment -> 'leftHand', 'rightHand', v_old_equipment -> 'rightHand'),
        'new_loadout', jsonb_build_object('leftHand', p_left_hand, 'rightHand', p_right_hand),
        'resolved_at', v_now
      ),
      updated_at = v_now
  WHERE id = p_action_id;

  INSERT INTO public.combat_log (
    combat_id, campaign_id, round_number, phase, actor_id, target_id,
    event_type, message, details, player_visible
  ) VALUES (
    p_combat_id, v_combat.campaign_id, p_round_number, coalesce(v_combat.phase, 'movement'),
    p_combatant_id, NULL, 'weapon_switch',
    coalesce(v_actor.name_snapshot, 'Stridande') || ' bytte/drog vapen',
    jsonb_build_object(
      'combatant_id', p_combatant_id,
      'character_id', p_character_id,
      'action_id', p_action_id,
      'old_loadout', jsonb_build_object('leftHand', v_old_equipment -> 'leftHand', 'rightHand', v_old_equipment -> 'rightHand'),
      'new_loadout', jsonb_build_object('leftHand', p_left_hand, 'rightHand', p_right_hand)
    ),
    true
  ) RETURNING id INTO v_log_id;

  RETURN jsonb_build_object('committed', true, 'action_id', p_action_id, 'combat_log_id', v_log_id);
END;
$$;

REVOKE ALL ON FUNCTION public.combat_commit_weapon_switch(uuid, uuid, uuid, uuid, integer, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.combat_commit_weapon_switch(uuid, uuid, uuid, uuid, integer, jsonb, jsonb) TO authenticated;
