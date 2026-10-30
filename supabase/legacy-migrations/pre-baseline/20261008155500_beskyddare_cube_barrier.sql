-- v0.34.72 – BESKYDDARE. Existing schema; idempotent rule-data migration.
INSERT INTO public.rule_effects
 (code,name,description,polarity,category,target_type,duration_unit,expiration_condition,
  stacking,default_duration_rounds,modifiers,parameter_schema,active)
VALUES
 ('area_beskyddare','BESKYDDARE',
 'Permanent kubisk barriär mot magi in och ut, samt Energistråle EG 1 mot föremål vid passage.',
 'positive','magic','area','permanent','dispelled','stack',NULL,
 '{"type":"magic_barrier","shape":"cube","barrier_eg":1,"bidirectional":true,"object_crossing":"energy_beam_eg1"}'::jsonb,
 '{"cube_dimensions_m":{"type":"object"},"barrier_eg":{"type":"integer"}}'::jsonb,true)
ON CONFLICT (code) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,target_type=EXCLUDED.target_type,
 duration_unit=EXCLUDED.duration_unit,expiration_condition=EXCLUDED.expiration_condition,
 modifiers=EXCLUDED.modifiers,parameter_schema=EXCLUDED.parameter_schema,
 active=true,updated_at=now();

UPDATE public.rule_spells SET
 description='Beskyddare skapar en permanent skyddskub med nio stenar. Grundkub 3 × 3 × 3 m (27 m³). Magi som passerar gränsen i endera riktningen måste övervinna Antimagi EG 1. Föremål som passerar får Energistråle EG 1. Bara skaparen kan avlägsna kuben; Skingra kan häva den.',
 effect_per_eg='EG 1: 3 × 3 × 3 m. Varje ytterligare EG ger +3 m på en vald ledd (längd, bredd eller höjd). Antimagi och Energistråle är alltid EG 1.',
 target_text='Kubiskt område runt person eller föremål, utplaceras med nio stenar.',
 resistance_text='Passage in och ut: magi prövas som EG mot Antimagi EG 1; föremål utsätts för Energistråle EG 1.',
 ritual=true,updated_at=now()
 WHERE upper(name)='BESKYDDARE';
