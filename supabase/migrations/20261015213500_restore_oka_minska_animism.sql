-- Restore Expert Animism spells omitted by the 2026-10-08 retirement.
-- Verified against Magiboken p. 9: one point per EG, S/4 minutes, no MINSKA below 1.
INSERT INTO public.rule_spells
 (spell_key,name,school_id,school_value,range_text,duration_text,psy_cost_text,
  target_text,effect_per_eg,resistance_text,description,notes,source_label,canonical_expert,sort_order)
VALUES
 ('minska','MINSKA','animism',6,'Beröring','S/4 minuter','1 PSY per EG',
  'En förhäxad varelse','−1 poäng i vald grundegenskap per EG','',
  'Varje effektgrad minskar den förhäxades STY, FYS, STO, KAR eller SMI med 1 poäng. Även färdigheter som baseras på egenskapen påverkas. Ingen grundegenskap får sänkas under 1.',
  'Magiboken s.9. Endast STY, FYS, STO, KAR och SMI.',
  'Drakar och Demoner Expert – Magiboken',true,140),
 ('oka','ÖKA','animism',6,'Beröring','S/4 minuter','1 PSY per EG',
  'En förhäxad varelse','+1 poäng i vald grundegenskap per EG','',
  'Varje effektgrad ökar den förhäxades STY, FYS, STO, KAR eller SMI med 1 poäng. Även färdigheter som baseras på egenskapen påverkas.',
  'Magiboken s.9. Endast STY, FYS, STO, KAR och SMI.',
  'Drakar och Demoner Expert – Magiboken',true,150)
ON CONFLICT (spell_key) DO UPDATE SET
 name=EXCLUDED.name,school_id=EXCLUDED.school_id,school_value=EXCLUDED.school_value,
 range_text=EXCLUDED.range_text,duration_text=EXCLUDED.duration_text,
 psy_cost_text=EXCLUDED.psy_cost_text,target_text=EXCLUDED.target_text,
 effect_per_eg=EXCLUDED.effect_per_eg,resistance_text=EXCLUDED.resistance_text,
 description=EXCLUDED.description,notes=EXCLUDED.notes,source_label=EXCLUDED.source_label,
 canonical_expert=EXCLUDED.canonical_expert,sort_order=EXCLUDED.sort_order,updated_at=now();

INSERT INTO public.rule_effects
 (code,name,description,polarity,category,stacking,modifiers,active,target_type,duration_unit,expiration_condition)
VALUES
 ('spell_oka','ÖKA','Animism: +1 poäng per EG i STY, FYS, STO, SMI eller KAR; grundegenskapsbaserade färdigheter påverkas.','positive','magic','refresh','{"type":"attribute_delta","direction":1}'::jsonb,true,'combatant','minute','duration'),
 ('spell_minska','MINSKA','Animism: −1 poäng per EG i STY, FYS, STO, SMI eller KAR, aldrig under 1; grundegenskapsbaserade färdigheter påverkas.','negative','magic','refresh','{"type":"attribute_delta","direction":-1}'::jsonb,true,'combatant','minute','duration')
ON CONFLICT (code) DO UPDATE SET
 name=EXCLUDED.name,description=EXCLUDED.description,polarity=EXCLUDED.polarity,
 category=EXCLUDED.category,stacking=EXCLUDED.stacking,modifiers=EXCLUDED.modifiers,
 active=EXCLUDED.active,target_type=EXCLUDED.target_type,duration_unit=EXCLUDED.duration_unit,
 expiration_condition=EXCLUDED.expiration_condition,updated_at=now();
