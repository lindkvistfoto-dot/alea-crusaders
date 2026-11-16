-- Remove retired spell entries from persisted character and combat spell lists.
UPDATE public.characters AS c
SET data=jsonb_set(c.data,'{spells}',COALESCE((
 SELECT jsonb_agg(x.item ORDER BY x.ord)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.data->'spells')='array'
   THEN c.data->'spells' ELSE '[]'::jsonb END)
 WITH ORDINALITY AS x(item,ord)
 WHERE upper(coalesce(x.item->>'name','')) NOT IN ('ÖKA','MINSKA')
),'[]'::jsonb),false),updated_at=now()
WHERE jsonb_typeof(c.data->'spells')='array'
 AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(c.data->'spells') AS x(item)
  WHERE upper(coalesce(x.item->>'name','')) IN ('ÖKA','MINSKA')
 );
UPDATE public.combatants AS c
SET state=jsonb_set(c.state,'{attack_profile,spells}',COALESCE((
 SELECT jsonb_agg(x.item ORDER BY x.ord)
 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(c.state #> '{attack_profile,spells}')='array'
 THEN c.state #> '{attack_profile,spells}' ELSE '[]'::jsonb END)
 WITH ORDINALITY AS x(item,ord)
 WHERE upper(coalesce(x.item->>'name','')) NOT IN ('ÖKA','MINSKA')
),'[]'::jsonb),false),updated_at=now()
WHERE jsonb_typeof(c.state #> '{attack_profile,spells}')='array'
 AND EXISTS (
  SELECT 1 FROM jsonb_array_elements(c.state #> '{attack_profile,spells}') AS x(item)
  WHERE upper(coalesce(x.item->>'name','')) IN ('ÖKA','MINSKA')
 );
