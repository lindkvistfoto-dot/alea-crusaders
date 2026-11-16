-- HAJ: validate and commit every hex of a planned path in one transaction.
-- The AFTER UPDATE area trigger runs for each step and rolls back with the move on errors.
CREATE OR REPLACE FUNCTION public.haj_move_combatant(
 p_combatant_id uuid,p_from_q integer,p_from_r integer,
 p_expected_remaining numeric,p_path jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_actor record;v_step jsonb;v_q integer;v_r integer;
 v_q_before integer;v_r_before integer;
 v_cost numeric;v_remaining numeric;v_spent numeric:=0;
 v_terrain text;v_notes text;v_flight boolean;
 v_area_difficult boolean;v_area_blocked boolean;
 v_step_count integer;v_index integer:=0;v_status text;v_current_kp integer;
 v_cond record;v_old_distance integer;v_new_distance integer;
BEGIN
 SELECT c.*,i.active_actor_id AS current_actor,i.phase AS combat_phase,
  i.status AS combat_status,i.round_number AS current_round
 INTO v_actor FROM public.combatants c
 JOIN public.combat_instances i ON i.id=c.combat_id
 WHERE c.id=p_combatant_id FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Combatant not found'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_actor.campaign_id)) THEN
  RAISE EXCEPTION 'Only the GM can commit combat movement';
 END IF;
 IF v_actor.combat_status<>'active' OR v_actor.combat_phase<>'movement'
    OR v_actor.current_actor IS DISTINCT FROM p_combatant_id
    OR v_actor.status IN ('dead','removed','defeated')
    OR v_actor.q IS DISTINCT FROM p_from_q OR v_actor.r IS DISTINCT FROM p_from_r
    OR v_actor.movement_remaining IS DISTINCT FROM p_expected_remaining
 THEN RAISE EXCEPTION 'Outdated movement state or inactive actor'; END IF;
 IF p_path IS NULL OR jsonb_typeof(p_path)<>'array' THEN RAISE EXCEPTION 'Movement path must be an array'; END IF;
 v_step_count:=jsonb_array_length(p_path);
 IF v_step_count<1 OR v_step_count>160 THEN RAISE EXCEPTION 'Invalid movement path length'; END IF;
 v_q_before:=v_actor.q;v_r_before:=v_actor.r;v_remaining:=v_actor.movement_remaining;
 v_flight:=coalesce(v_actor.flying,false) OR EXISTS(
  SELECT 1 FROM public.combatant_effects e JOIN public.rule_effects d ON d.id=e.effect_id
  WHERE e.combat_id=v_actor.combat_id AND e.combatant_id=p_combatant_id
   AND e.status='active' AND e.applied_round<=v_actor.current_round
   AND (e.expires_round IS NULL OR e.expires_round>=v_actor.current_round)
   AND (e.expires_at IS NULL OR e.expires_at>now())
   AND d.active AND d.modifiers->>'type'='flight'
   AND d.modifiers->>'ignore_terrain'='true'
 );
 FOR v_step IN SELECT value FROM jsonb_array_elements(p_path)
 LOOP
  IF jsonb_typeof(v_step)<>'object' OR coalesce(v_step->>'q','') !~ '^[-]?[0-9]{1,6}$'
    OR coalesce(v_step->>'r','') !~ '^[-]?[0-9]{1,6}$' THEN
   RAISE EXCEPTION 'Invalid hex step';
  END IF;
  v_q:=(v_step->>'q')::integer;v_r:=(v_step->>'r')::integer;
  IF (abs(v_q-v_q_before)+abs(v_r-v_r_before)+abs(v_q-v_q_before+v_r-v_r_before))<>2 THEN
   RAISE EXCEPTION 'Movement path contains a nonadjacent hex';
  END IF;
  SELECT movement_mode,notes INTO v_terrain,v_notes
  FROM public.combat_hexes WHERE combat_id=v_actor.combat_id AND q=v_q AND r=v_r;
  IF coalesce(v_notes,'') ~* '(^|[[:space:],;|])(wall|vägg|mur)($|[[:space:],;|])' THEN
   RAISE EXCEPTION 'A wall blocks the movement path';
  END IF;
  SELECT coalesce(bool_or(d.modifiers->>'movement_mode'='difficult'),false),
   coalesce(bool_or(d.modifiers->>'movement_mode'='blocked'),false)
  INTO v_area_difficult,v_area_blocked
  FROM public.combat_area_effects a JOIN public.rule_effects d ON d.id=a.effect_id
  WHERE a.combat_id=v_actor.combat_id AND a.status='active' AND d.active
   AND a.applied_round<=v_actor.current_round
   AND (a.expires_round IS NULL OR a.expires_round>=v_actor.current_round)
   AND d.modifiers->>'type'='area_terrain'
   AND (abs(v_q-a.center_q)+abs(v_r-a.center_r)+abs(v_q-a.center_q+v_r-a.center_r))/2<=a.radius;
  IF NOT v_flight AND (v_terrain='blocked' OR v_area_blocked) THEN
   RAISE EXCEPTION 'Impassable terrain in the movement path';
  END IF;
  IF v_index=v_step_count-1 AND EXISTS(
    SELECT 1 FROM public.combatants c WHERE c.combat_id=v_actor.combat_id
    AND c.id<>p_combatant_id AND c.q=v_q AND c.r=v_r AND c.status<>'removed'
  ) THEN RAISE EXCEPTION 'Destination hex is occupied'; END IF;
  FOR v_cond IN
   SELECT d.modifiers->>'type' AS kind,source.q AS source_q,source.r AS source_r
   FROM public.combatant_effects e JOIN public.rule_effects d ON d.id=e.effect_id
   JOIN public.combatants source ON source.id=e.source_combatant_id AND source.combat_id=e.combat_id
   WHERE e.combat_id=v_actor.combat_id AND e.combatant_id=p_combatant_id
    AND e.status='active' AND e.applied_round<=v_actor.current_round
    AND (e.expires_round IS NULL OR e.expires_round>=v_actor.current_round)
    AND (e.expires_at IS NULL OR e.expires_at>now())
    AND d.active AND d.modifiers->>'type' IN ('fear','panic')
  LOOP
   v_old_distance:=(abs(v_q_before-v_cond.source_q)+abs(v_r_before-v_cond.source_r)
     +abs(v_q_before-v_cond.source_q+v_r_before-v_cond.source_r))/2;
   v_new_distance:=(abs(v_q-v_cond.source_q)+abs(v_r-v_cond.source_r)
     +abs(v_q-v_cond.source_q+v_r-v_cond.source_r))/2;
   IF (v_cond.kind='fear' AND v_new_distance<v_old_distance)
     OR (v_cond.kind='panic' AND v_new_distance<=v_old_distance) THEN
    RAISE EXCEPTION 'Fear or panic restricts movement towards the source';
   END IF;
  END LOOP;
  v_cost:=CASE WHEN v_flight THEN 1 WHEN v_terrain='difficult' OR v_area_difficult THEN 2 ELSE 1 END;
  IF v_remaining<v_cost THEN RAISE EXCEPTION 'Not enough remaining movement'; END IF;
  v_remaining:=v_remaining-v_cost;v_spent:=v_spent+v_cost;
  UPDATE public.combatants SET q=v_q,r=v_r,movement_remaining=v_remaining,updated_at=now()
  WHERE id=p_combatant_id;
  -- Crossing an area may defeat a character; stop instead of moving a dead unit.
  SELECT status,current_kp INTO v_status,v_current_kp FROM public.combatants WHERE id=p_combatant_id;
  v_q_before:=v_q;v_r_before:=v_r;v_index:=v_index+1;
  IF v_status IN ('dead','removed','defeated') THEN EXIT; END IF;
 END LOOP;
 RETURN jsonb_build_object('id',p_combatant_id,'q',v_q_before,'r',v_r_before,
  'movement_remaining',v_remaining,'spent',v_spent,'status',v_status,
  'current_kp',v_current_kp,'interrupted',v_index<v_step_count);
END $fn$;
REVOKE ALL ON FUNCTION public.haj_move_combatant(uuid,integer,integer,numeric,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.haj_move_combatant(uuid,integer,integer,numeric,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.haj_move_combatant(uuid,integer,integer,numeric,jsonb) TO authenticated;
