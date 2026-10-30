-- Explicitly prioritize crossbow bolts over the generic "pilar" legacy name.
update public.characters c
set data=jsonb_set(c.data,'{projectiles}',(
 select coalesce(jsonb_agg(
  case when coalesce(p->>'projectileKey','')='arrow'
    and lower(coalesce(p->>'name','')) ~ 'armborst|skäkt'
   then p||jsonb_build_object('projectileKey','bolt')
   else p end
  order by ord),'[]'::jsonb)
 from jsonb_array_elements(case when jsonb_typeof(c.data->'projectiles')='array' then c.data->'projectiles' else '[]'::jsonb end) with ordinality as rows(p,ord)
),true)
where jsonb_typeof(c.data->'projectiles')='array'
 and exists(select 1 from jsonb_array_elements(c.data->'projectiles') as p
  where coalesce(p->>'projectileKey','')='arrow' and lower(coalesce(p->>'name','')) ~ 'armborst|skäkt');