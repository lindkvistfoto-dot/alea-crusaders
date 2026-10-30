-- TIGER: reversible conditions for GM assignment; no Expert resistance or duration is inferred.
-- Explicit source_combatant_id is set when applying fear, panic or control.
INSERT INTO public.rule_effects
(code,name,description,polarity,category,target_type,duration_unit,default_duration_rounds,expiration_condition,stacking,modifiers,parameter_schema,active)
VALUES
('condition_fear','RÄDSLA','Kan inte närma sig eller anfalla källan. Varaktighet och motstånd avgörs av SL.','negative','condition','combatant','round',null,'manual','refresh','{"type":"fear"}'::jsonb,'{"requires_source":true}'::jsonb,true),
('condition_panic','PANIK','Måste förflytta sig bort från källan. Handlingar och reaktioner spärras tills effekten upphör.','negative','condition','combatant','round',null,'manual','refresh','{"type":"panic","disable_actions":true,"disable_reactions":true}'::jsonb,'{"requires_source":true}'::jsonb,true),
('condition_confusion','FÖRVIRRING','Handlingar och reaktioner spärras medan förflyttning fortfarande är möjlig.','negative','condition','combatant','round',null,'manual','refresh','{"type":"confusion","disable_actions":true,"disable_reactions":true}'::jsonb,'{}'::jsonb,true),
('condition_control','KONTROLLERAD','Tillfällig lojalitet mot styrande kombatants sida vid attackval. Ursprunglig sida ändras inte.','negative','condition','combatant','round',null,'manual','refresh','{"type":"control"}'::jsonb,'{"requires_source":true}'::jsonb,true)
ON CONFLICT (code) DO NOTHING;
