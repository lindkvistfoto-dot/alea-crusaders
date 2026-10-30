-- HAJ: undo restores coordinates without firing area entry/exit triggers.
-- Scoped to one RPC transaction; unlike a persistent combat flag, it cannot remain stuck.
CREATE OR REPLACE FUNCTION public.haj_restore_combatant(p_combatant_id uuid,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE v_campaign uuid;v_id uuid;v_combat uuid;
BEGIN
 SELECT campaign_id,combat_id INTO v_campaign,v_combat FROM public.combatants WHERE id=p_combatant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing combatant'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_campaign)) THEN RAISE EXCEPTION 'Only the GM can undo combat'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object'
   OR coalesce(p_snapshot->>'id','')<>p_combatant_id::text
   OR p_snapshot->>'q' IS NULL OR p_snapshot->>'r' IS NULL
   OR p_snapshot->>'q' !~ '^[-]?[0-9]{1,6}$'
   OR p_snapshot->>'r' !~ '^[-]?[0-9]{1,6}$'
 THEN RAISE EXCEPTION 'Invalid undo snapshot'; END IF;
 PERFORM set_config('alea.haj_restore','on',true);
 UPDATE public.combatants SET
  q=(p_snapshot->>'q')::integer,r=(p_snapshot->>'r')::integer,
  flying=coalesce((p_snapshot->>'flying')::boolean,false),
  visible_to_players=coalesce((p_snapshot->>'visible_to_players')::boolean,true),
  current_kp=CASE WHEN p_snapshot->>'current_kp' IS NULL THEN NULL ELSE (p_snapshot->>'current_kp')::integer END,
  current_psy=CASE WHEN p_snapshot->>'current_psy' IS NULL THEN NULL ELSE (p_snapshot->>'current_psy')::integer END,
  movement_remaining=(p_snapshot->>'movement_remaining')::numeric,
  status=coalesce(p_snapshot->>'status','active'),
  action_plan=coalesce(p_snapshot->'action_plan','[]'::jsonb),
  state=coalesce(p_snapshot->'state','{}'::jsonb),updated_at=now()
 WHERE id=p_combatant_id;
 RETURN jsonb_build_object('restored',true,'combatant_id',p_combatant_id);
END $fn$;
REVOKE ALL ON FUNCTION public.haj_restore_combatant(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.haj_restore_combatant(uuid,jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.haj_restore_combatant(uuid,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION private.haj_combatant_move()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
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
  v_old_inside:=(abs(OLD.q-v_area.center_q)+abs(OLD.r-v_area.center_r)+abs(OLD.q-v_area.center_q+OLD.r-v_area.center_r))/2<=v_area.radius;
  v_new_inside:=(abs(NEW.q-v_area.center_q)+abs(NEW.r-v_area.center_r)+abs(NEW.q-v_area.center_q+NEW.r-v_area.center_r))/2<=v_area.radius;
  IF v_old_inside IS DISTINCT FROM v_new_inside THEN
   v_event:=CASE WHEN v_new_inside THEN 'enter' ELSE 'exit' END;
   PERFORM private.haj_area_event(v_area.id,NEW.id,v_round,v_event);
  END IF;
 END LOOP;
 RETURN NEW;
END $fn$;
GRANT DELETE ON public.combat_area_events TO authenticated;
