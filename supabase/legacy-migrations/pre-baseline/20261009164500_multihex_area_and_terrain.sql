-- Alea Crusaders: shape-aware area triggers, no duplicate damage for overlapping hexes.
CREATE OR REPLACE FUNCTION private.haj_combatant_move()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_area record;v_event text;v_round integer;v_status text;v_old_inside boolean;v_new_inside boolean;
BEGIN
 IF current_setting('alea.haj_restore',true)='on' THEN RETURN NEW; END IF;
 SELECT round_number,status INTO v_round,v_status FROM public.combat_instances WHERE id=NEW.combat_id;
 IF v_status<>'active' OR v_round IS NULL OR NEW.status='removed' THEN RETURN NEW; END IF;
 FOR v_area IN
  SELECT a.id,a.center_q,a.center_r,a.radius
  FROM public.combat_area_effects a JOIN public.rule_effects d ON d.id=a.effect_id AND d.active
  WHERE a.combat_id=NEW.combat_id AND a.status='active' AND a.applied_round<=v_round
   AND (a.expires_round IS NULL OR a.expires_round>=v_round)
   AND d.target_type IN ('area','hex')
  ORDER BY a.id
 LOOP
  v_old_inside:=EXISTS(
   SELECT 1 FROM public.alea_footprint_cells(OLD.q,OLD.r,
    public.alea_footprint_shape(OLD.state,OLD.name_snapshot),
    coalesce((OLD.state->'footprint'->>'facing')::integer,0)) fp
   WHERE (abs(fp.q-v_area.center_q)+abs(fp.r-v_area.center_r)+
    abs(fp.q-v_area.center_q+fp.r-v_area.center_r))/2<=v_area.radius
  );
  v_new_inside:=EXISTS(
   SELECT 1 FROM public.alea_footprint_cells(NEW.q,NEW.r,
    public.alea_footprint_shape(NEW.state,NEW.name_snapshot),
    coalesce((NEW.state->'footprint'->>'facing')::integer,0)) fp
   WHERE (abs(fp.q-v_area.center_q)+abs(fp.r-v_area.center_r)+
    abs(fp.q-v_area.center_q+fp.r-v_area.center_r))/2<=v_area.radius
  );
  IF v_old_inside IS DISTINCT FROM v_new_inside THEN
   v_event:=CASE WHEN v_new_inside THEN 'enter' ELSE 'exit' END;
   PERFORM private.haj_area_event(v_area.id,NEW.id,v_round,v_event);
  END IF;
 END LOOP;
 RETURN NEW;
END $function$
;
CREATE OR REPLACE FUNCTION public.resolve_combat_area_stay(p_combatant_id uuid, p_round integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_actor record; v_area record; v_result jsonb; v_events jsonb:='[]'::jsonb;
BEGIN
 SELECT c.*,i.round_number AS current_round,i.status AS combat_status,
  i.phase AS combat_phase,i.active_actor_id AS current_actor
 INTO v_actor
 FROM public.combatants c JOIN public.combat_instances i ON i.id=c.combat_id
 WHERE c.id=p_combatant_id FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Combatant not found'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_actor.campaign_id)) THEN
  RAISE EXCEPTION 'Only the GM can resolve area effects';
 END IF;
 IF v_actor.combat_status<>'active' OR v_actor.combat_phase<>'movement'
    OR v_actor.current_actor IS DISTINCT FROM p_combatant_id
    OR v_actor.current_round<>p_round THEN
  RAISE EXCEPTION 'Area stay can only resolve on the current active turn';
 END IF;
 FOR v_area IN
  SELECT a.id FROM public.combat_area_effects a
  JOIN public.rule_effects d ON d.id=a.effect_id AND d.active
  WHERE a.combat_id=v_actor.combat_id AND a.status='active'
    AND a.applied_round<=p_round AND (a.expires_round IS NULL OR a.expires_round>=p_round)
    AND d.target_type IN ('hex','area')
    AND EXISTS(
     SELECT 1 FROM public.alea_footprint_cells(v_actor.q,v_actor.r,
      public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot),
      coalesce((v_actor.state->'footprint'->>'facing')::integer,0)) fp
     WHERE (abs(fp.q-a.center_q)+abs(fp.r-a.center_r)+
      abs(fp.q-a.center_q+fp.r-a.center_r))/2<=a.radius
    )
  ORDER BY a.id
 LOOP
  v_result:=private.haj_area_event(v_area.id,p_combatant_id,p_round,'stay');
  v_events:=v_events||jsonb_build_array(jsonb_build_object('area_id',v_area.id,'result',v_result));
 END LOOP;
 RETURN v_events;
END $function$
;
CREATE OR REPLACE FUNCTION public.haj_move_combatant(p_combatant_id uuid, p_from_q integer, p_from_r integer, p_expected_remaining numeric, p_path jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_cost:=CASE WHEN v_flight THEN 1 WHEN
   EXISTS(
    SELECT 1 FROM public.alea_footprint_cells(v_q,v_r,
      public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot),
      coalesce((v_actor.state->'footprint'->>'facing')::integer,0)) fp
    LEFT JOIN public.combat_hexes tile ON tile.combat_id=v_actor.combat_id AND tile.q=fp.q AND tile.r=fp.r
    WHERE tile.movement_mode='difficult' OR EXISTS(
     SELECT 1 FROM public.combat_area_effects a
     JOIN public.rule_effects d ON d.id=a.effect_id
     WHERE a.combat_id=v_actor.combat_id AND a.status='active' AND d.active
     AND d.modifiers->>'type'='area_terrain'
     AND d.modifiers->>'movement_mode'='difficult'
     AND a.applied_round<=v_actor.current_round
     AND (a.expires_round IS NULL OR a.expires_round>=v_actor.current_round)
     AND (abs(fp.q-a.center_q)+abs(fp.r-a.center_r)+abs(fp.q-a.center_q+fp.r-a.center_r))/2<=a.radius
    )
   ) THEN 2 ELSE 1 END;
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
END $function$
;
