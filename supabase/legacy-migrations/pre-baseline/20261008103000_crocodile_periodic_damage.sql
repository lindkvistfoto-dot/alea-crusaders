-- KROKODIL: GM-configured fixed KP per SR. No unspecified Expert dice, saving throws or durations.
INSERT INTO public.rule_effects
 (code,name,description,polarity,category,target_type,duration_unit,default_duration_rounds,expiration_condition,stacking,modifiers,parameter_schema,active)
VALUES
 ('condition_poison','GIFT','Manuellt fastställd skada per SR; avräknas när den drabbade avslutar sitt drag.','negative','poison','combatant','round',null,'manual','refresh','{"type":"damage_over_time","damage_kind":"poison"}','{"damage_per_round":"integer"}',true),
 ('condition_burning','BRINNER','Manuellt fastställd eldskada per SR.','negative','condition','combatant','round',null,'manual','refresh','{"type":"damage_over_time","damage_kind":"fire"}','{"damage_per_round":"integer"}',true),
 ('condition_bleeding','BLÖDER','Manuellt fastställd fortlöpande fysisk skada per SR.','negative','condition','combatant','round',null,'manual','refresh','{"type":"damage_over_time","damage_kind":"physical"}','{"damage_per_round":"integer"}',true),
 ('condition_ward','SKYDDSFÄLT','Skyddspoäng mot all skada, konfigureras av SL. Endast starkaste matchande skyddet tillämpas.','positive','magic','combatant','round',null,'manual','refresh','{"type":"protection","damage_kind":"all"}','{"protection_points":"integer"}',true),
 ('condition_antipoison','GIFTSKYDD','Skyddspoäng mot giftskada, konfigureras av SL.','positive','condition','combatant','round',null,'manual','refresh','{"type":"protection","damage_kind":"poison"}','{"protection_points":"integer"}',true),
 ('condition_fire_shield','ELDSKYDD','Skyddspoäng mot eldskada, konfigureras av SL.','positive','magic','combatant','round',null,'manual','refresh','{"type":"protection","damage_kind":"fire"}','{"protection_points":"integer"}',true)
ON CONFLICT (code) DO NOTHING;

-- Authorized, idempotent, transactional periodic damage resolution.
-- One pulse per effect and round, with KP update + audit log in the same transaction.
CREATE OR REPLACE FUNCTION public.resolve_combat_dot(p_effect_id uuid,p_round integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $function$
DECLARE
 v_effect record;
 v_protect record;
 v_def record;
 v_kind text;
 v_raw text;
 v_base integer;
 v_protection integer := 0;
 v_net integer;
 v_before integer;
 v_after integer;
 v_prev integer;
 v_source_name text;
BEGIN
 IF p_round IS NULL OR p_round < 1 THEN
  RAISE EXCEPTION 'Ogiltig stridsrunda.';
 END IF;
 SELECT e.*, c.current_kp AS target_kp,c.status AS target_status,c.name_snapshot AS target_name,
        i.round_number AS instance_round,i.active_actor_id AS instance_actor,
        i.status AS instance_status,i.phase AS instance_phase
 INTO v_effect
 FROM public.combatant_effects e
 JOIN public.combatants c ON c.id=e.combatant_id AND c.combat_id=e.combat_id
 JOIN public.combat_instances i ON i.id=e.combat_id AND i.campaign_id=e.campaign_id
 WHERE e.id=p_effect_id
 FOR UPDATE OF e,c,i;
 IF NOT FOUND THEN RAISE EXCEPTION 'Effekten finns inte i denna strid.'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_effect.campaign_id)) THEN
  RAISE EXCEPTION 'Endast SL får verkställa fortlöpande skada.';
 END IF;
 IF v_effect.instance_round<>p_round OR v_effect.instance_actor IS DISTINCT FROM v_effect.combatant_id
    OR v_effect.instance_status<>'active' OR v_effect.instance_phase<>'movement' THEN
  RAISE EXCEPTION 'Skadan kan bara behandlas på den drabbades aktiva drag.';
 END IF;
 SELECT * INTO v_def FROM public.rule_effects WHERE id=v_effect.effect_id;
 IF NOT FOUND OR NOT v_def.active OR v_def.modifiers->>'type'<>'damage_over_time' THEN
  RAISE EXCEPTION 'Effekten ger inte fortlöpande skada.';
 END IF;
 v_kind := v_def.modifiers->>'damage_kind';
 IF v_kind NOT IN ('poison','fire','physical','magic') THEN
  RAISE EXCEPTION 'Effekten saknar giltig skadetyp.';
 END IF;
 IF v_effect.status<>'active' OR v_effect.applied_round>p_round
    OR (v_effect.expires_round IS NOT NULL AND v_effect.expires_round<p_round)
    OR (v_effect.expires_at IS NOT NULL AND v_effect.expires_at<=now()) THEN
  RETURN jsonb_build_object('applied',false,'reason','expired');
 END IF;
 v_raw:=v_effect.parameters->>'last_tick_round';
 IF v_raw ~ '^[0-9]{1,8}$' AND v_raw::integer>=p_round THEN
  RETURN jsonb_build_object('applied',false,'reason','already_resolved');
 END IF;
 IF v_effect.target_kp IS NULL OR v_effect.target_status IN ('dead','removed','defeated') THEN
  RETURN jsonb_build_object('applied',false,'reason','not_damageable');
 END IF;
 v_raw:=v_effect.parameters->>'damage_per_round';
 IF v_raw IS NULL OR v_raw !~ '^[0-9]{1,4}$' OR v_raw::integer<1 THEN
  RAISE EXCEPTION 'Effektens skada per SR måste vara ett positivt heltal.';
 END IF;
 v_base:=v_raw::integer;
 FOR v_protect IN
  SELECT p.parameters,d.modifiers
  FROM public.combatant_effects p
  JOIN public.rule_effects d ON d.id=p.effect_id
  WHERE p.combat_id=v_effect.combat_id AND p.combatant_id=v_effect.combatant_id
    AND p.status='active' AND p.applied_round<=p_round
    AND (p.expires_round IS NULL OR p.expires_round>=p_round)
    AND (p.expires_at IS NULL OR p.expires_at>now())
    AND d.active AND d.modifiers->>'type'='protection'
    AND d.modifiers->>'damage_kind' IN ('all',v_kind)
 LOOP
  v_raw:=v_protect.parameters->>'protection_points';
  IF v_raw ~ '^[0-9]{1,4}$' THEN
   v_protection:=greatest(v_protection,v_raw::integer);
  END IF;
 END LOOP;
 v_net:=greatest(0,v_base-v_protection);
 v_before:=v_effect.target_kp;
 v_after:=greatest(0,v_before-v_net);
 UPDATE public.combatants SET current_kp=v_after,
   status=CASE WHEN v_after=0 THEN 'dead' ELSE status END,
   updated_at=now()
 WHERE id=v_effect.combatant_id;
 UPDATE public.combatant_effects
 SET parameters=jsonb_set(coalesce(parameters,'{}'::jsonb),'{last_tick_round}',to_jsonb(p_round)),
     updated_at=now()
 WHERE id=p_effect_id;
 SELECT name_snapshot INTO v_source_name FROM public.combatants
 WHERE id=v_effect.source_combatant_id AND combat_id=v_effect.combat_id;
 INSERT INTO public.combat_log
 (combat_id,campaign_id,round_number,phase,actor_id,target_id,event_type,message,details,player_visible)
 VALUES
 (v_effect.combat_id,v_effect.campaign_id,p_round,'damage',v_effect.source_combatant_id,v_effect.combatant_id,
  'effect_tick',v_effect.target_name||' drabbas av '||v_def.name||': '||v_base||' KP - skydd '||v_protection||' = '||v_net||' KP ('
   ||v_before||' → '||v_after||')',
  jsonb_build_object('effect_id',p_effect_id,'effect',v_def.code,'kind',v_kind,'gross',v_base,
    'protection',v_protection,'net',v_net,'kp_before',v_before,'kp_after',v_after,
    'round',p_round,'source',v_source_name),true);
 RETURN jsonb_build_object('applied',true,'gross',v_base,'protection',v_protection,'net',v_net,
   'kp_before',v_before,'kp_after',v_after,'defeated',v_after=0,'round',p_round);
END;
$function$;
REVOKE ALL ON FUNCTION public.resolve_combat_dot(uuid,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_combat_dot(uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.resolve_combat_dot(uuid,integer) TO authenticated;
