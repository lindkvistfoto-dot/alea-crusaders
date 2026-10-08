-- HAJ: server-side hex transitions and idempotent per-round presence.
CREATE OR REPLACE FUNCTION private.haj_area_event(p_area uuid,p_combatant uuid,p_round integer,p_event text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_area record;
 v_target record;
 v_raw text;
 v_gross int:=0;
 v_ward int:=0;
 v_net int:=0;
 v_before int;
 v_after int;
 v_event_id bigint;
BEGIN
 IF p_event NOT IN ('enter','stay','exit') OR p_round<1 THEN RAISE EXCEPTION 'Invalid area event'; END IF;
 SELECT a.*,d.name AS effect_name,d.active AS definition_active,d.modifiers,
        d.target_type
 INTO v_area
 FROM public.combat_area_effects a
 JOIN public.rule_effects d ON d.id=a.effect_id
 WHERE a.id=p_area FOR SHARE OF a;
 IF NOT FOUND OR v_area.status<>'active' OR NOT v_area.definition_active
    OR v_area.target_type NOT IN ('area','hex') OR v_area.applied_round>p_round
    OR (v_area.expires_round IS NOT NULL AND v_area.expires_round<p_round)
 THEN RETURN jsonb_build_object('applied',false,'reason','inactive'); END IF;
 SELECT * INTO v_target FROM public.combatants
 WHERE id=p_combatant AND combat_id=v_area.combat_id AND campaign_id=v_area.campaign_id
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid area combatant'; END IF;
 v_raw:=coalesce(v_area.parameters->>('damage_on_'||p_event),'0');
 IF v_raw !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'Invalid area damage'; END IF;
 IF v_area.modifiers->>'type'='area_damage' THEN v_gross:=v_raw::int; END IF;
 IF v_target.current_kp IS NULL OR v_target.status IN ('dead','removed','defeated') THEN v_gross:=0; END IF;
 SELECT coalesce(max((e.parameters->>'protection_points')::int),0) INTO v_ward
 FROM public.combatant_effects e JOIN public.rule_effects d ON d.id=e.effect_id
 WHERE e.combat_id=v_area.combat_id AND e.combatant_id=p_combatant
  AND e.status='active' AND e.applied_round<=p_round
  AND (e.expires_round IS NULL OR e.expires_round>=p_round)
  AND (e.expires_at IS NULL OR e.expires_at>now())
  AND d.active AND d.modifiers->>'type'='protection'
  AND d.modifiers->>'damage_kind' IN ('all',v_area.modifiers->>'damage_kind')
  AND e.parameters->>'protection_points' ~ '^[0-9]{1,4}$';
 v_net:=greatest(0,v_gross-v_ward);
 v_before:=coalesce(v_target.current_kp,0);
 v_after:=greatest(0,v_before-v_net);
 INSERT INTO public.combat_area_events
 (area_id,combat_id,campaign_id,combatant_id,round_number,event_type,gross_damage,protection,net_damage)
 VALUES(p_area,v_area.combat_id,v_area.campaign_id,p_combatant,p_round,p_event,v_gross,v_ward,v_net)
 ON CONFLICT DO NOTHING RETURNING id INTO v_event_id;
 IF v_event_id IS NULL THEN
  RETURN jsonb_build_object('applied',false,'reason','already_resolved');
 END IF;
 IF v_net>0 THEN
  UPDATE public.combatants SET current_kp=v_after,
   status=CASE WHEN v_after=0 THEN 'dead' ELSE status END,updated_at=now()
  WHERE id=p_combatant;
 END IF;
 INSERT INTO public.combat_log
 (combat_id,campaign_id,round_number,phase,actor_id,target_id,event_type,message,details,player_visible)
 VALUES(v_area.combat_id,v_area.campaign_id,p_round,'damage',v_area.source_combatant_id,p_combatant,
  'area_'||p_event,
  v_target.name_snapshot||CASE p_event WHEN 'enter' THEN ' går in i ' WHEN 'exit' THEN ' lämnar ' ELSE ' vistas i ' END
  ||v_area.effect_name||CASE WHEN v_gross>0 THEN ' · '||v_net||' KP skada' ELSE '' END,
  jsonb_build_object('area_id',p_area,'event',p_event,'gross',v_gross,'protection',v_ward,'net',v_net,
    'kp_before',v_before,'kp_after',v_after),true);
 RETURN jsonb_build_object('applied',true,'event',p_event,'net',v_net,'kp_before',v_before,'kp_after',v_after);
END $fn$;
REVOKE ALL ON FUNCTION private.haj_area_event(uuid,uuid,integer,text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.haj_validate_area()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_campaign uuid; v_target text; v_source uuid;
BEGIN
 SELECT campaign_id INTO v_campaign FROM public.combat_instances WHERE id=NEW.combat_id;
 IF v_campaign IS NULL OR v_campaign<>NEW.campaign_id THEN RAISE EXCEPTION 'Area campaign mismatch'; END IF;
 SELECT target_type INTO v_target FROM public.rule_effects WHERE id=NEW.effect_id AND active;
 IF v_target NOT IN ('area','hex') OR v_target IS NULL THEN RAISE EXCEPTION 'Area requires area/hex rule'; END IF;
 IF NEW.source_combatant_id IS NOT NULL THEN
  SELECT combat_id INTO v_source FROM public.combatants WHERE id=NEW.source_combatant_id;
  IF v_source IS DISTINCT FROM NEW.combat_id THEN RAISE EXCEPTION 'Area source belongs to another combat'; END IF;
 END IF;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS haj_area_validate ON public.combat_area_effects;
CREATE TRIGGER haj_area_validate BEFORE INSERT OR UPDATE ON public.combat_area_effects
 FOR EACH ROW EXECUTE FUNCTION private.haj_validate_area();

CREATE OR REPLACE FUNCTION private.haj_combatant_move()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE
 v_area record;v_event text;v_round int;v_status text;
 v_old_inside boolean;v_new_inside boolean;
BEGIN
 SELECT round_number,status INTO v_round,v_status FROM public.combat_instances WHERE id=NEW.combat_id;
 IF v_status<>'active' OR v_round IS NULL OR NEW.status='removed' THEN RETURN NEW; END IF;
 FOR v_area IN
  SELECT a.id,a.center_q,a.center_r,a.radius
  FROM public.combat_area_effects a
  JOIN public.rule_effects d ON d.id=a.effect_id AND d.active
  WHERE a.combat_id=NEW.combat_id AND a.status='active' AND a.applied_round<=v_round
   AND (a.expires_round IS NULL OR a.expires_round>=v_round)
   AND d.target_type IN ('area','hex')
 ORDER BY a.id
 LOOP
  v_old_inside:=(abs(OLD.q-v_area.center_q)+abs(OLD.r-v_area.center_r)+abs((OLD.q-v_area.center_q)+(OLD.r-v_area.center_r)))/2<=v_area.radius;
  v_new_inside:=(abs(NEW.q-v_area.center_q)+abs(NEW.r-v_area.center_r)+abs((NEW.q-v_area.center_q)+(NEW.r-v_area.center_r)))/2<=v_area.radius;
  IF v_old_inside IS DISTINCT FROM v_new_inside THEN
   v_event:=CASE WHEN v_new_inside THEN 'enter' ELSE 'exit' END;
   PERFORM private.haj_area_event(v_area.id,NEW.id,v_round,v_event);
  END IF;
 END LOOP;
 RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS haj_combatant_move ON public.combatants;
CREATE TRIGGER haj_combatant_move AFTER UPDATE OF q,r ON public.combatants
 FOR EACH ROW WHEN(OLD.q IS DISTINCT FROM NEW.q OR OLD.r IS DISTINCT FROM NEW.r)
 EXECUTE FUNCTION private.haj_combatant_move();

CREATE OR REPLACE FUNCTION public.resolve_combat_area_stay(p_combatant_id uuid,p_round integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
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
    AND (abs(v_actor.q-a.center_q)+abs(v_actor.r-a.center_r)
      +abs((v_actor.q-a.center_q)+(v_actor.r-a.center_r)))/2<=a.radius
  ORDER BY a.id
 LOOP
  v_result:=private.haj_area_event(v_area.id,p_combatant_id,p_round,'stay');
  v_events:=v_events||jsonb_build_array(jsonb_build_object('area_id',v_area.id,'result',v_result));
 END LOOP;
 RETURN v_events;
END $fn$;
REVOKE ALL ON FUNCTION public.resolve_combat_area_stay(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_combat_area_stay(uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_combat_area_stay(uuid,integer) TO authenticated;
