-- Preserve the campaign's existing per-weapon FV/ERF as weapon-skill data.
-- Existing skill rows always win over legacy values stored on weapon copies.

update public.characters c
set data = jsonb_set(
  c.data,
  '{skills}',
  coalesce((
    select jsonb_agg(
      case
        when lower(coalesce(s.value->>'name',''))='stavkamp'
             and coalesce(s.value->>'skillId','')=''
        then s.value || jsonb_build_object('skillId','stavar','name','Stavar')
        else s.value
      end
      order by s.ord
    )
    from jsonb_array_elements(coalesce(c.data->'skills','[]'::jsonb))
         with ordinality as s(value,ord)
  ),'[]'::jsonb),
  true
)
where exists (
  select 1
  from jsonb_array_elements(coalesce(c.data->'skills','[]'::jsonb)) s(value)
  where lower(coalesce(s.value->>'name',''))='stavkamp'
    and coalesce(s.value->>'skillId','')=''
);

with candidates as (
  select c.id as character_id,
         rw.skill_id,
         rs.name as skill_name,
         max(
           case when coalesce(w.value->>'fv','') ~ '^[0-9]+([.][0-9]+)?$'
                then (w.value->>'fv')::numeric end
         ) as fv,
         max(
           case when coalesce(w.value->>'erf','') ~ '^[0-9]+([.][0-9]+)?$'
                then (w.value->>'erf')::numeric else 0 end
         ) as erf
  from public.characters c
  cross join lateral jsonb_array_elements(coalesce(c.data->'weapons','[]'::jsonb)) w(value)
  join public.rule_weapons rw
    on rw.id::text=coalesce(w.value->>'weapon_id',w.value->>'weaponTypeId')
  join public.rule_skills rs on rs.id=rw.skill_id
  where rw.skill_id is not null
  group by c.id,rw.skill_id,rs.name
),
missing as (
  select ca.*
  from candidates ca
  join public.characters c on c.id=ca.character_id
  where ca.fv is not null
    and not exists (
      select 1
      from jsonb_array_elements(coalesce(c.data->'skills','[]'::jsonb)) s(value)
      where s.value->>'skillId'=ca.skill_id
    )
),
additions as (
  select character_id,
         jsonb_agg(
           jsonb_build_object(
             'skillId',skill_id,
             'name',skill_name,
             'fv',fv,
             'erf',coalesce(erf,0)
           )
           order by skill_name
         ) as skills_to_add
  from missing
  group by character_id
)
update public.characters c
set data=jsonb_set(
  c.data,
  '{skills}',
  coalesce(c.data->'skills','[]'::jsonb) || a.skills_to_add,
  true
)
from additions a
where c.id=a.character_id;

update public.characters c
set data=jsonb_set(
  c.data,
  '{weapons}',
  coalesce((
    select jsonb_agg(
      case
        when rw.skill_id is not null
        then w.value || jsonb_build_object('skillId',rw.skill_id,'skillName',rs.name)
        else w.value
      end
      order by w.ord
    )
    from jsonb_array_elements(coalesce(c.data->'weapons','[]'::jsonb))
         with ordinality as w(value,ord)
    left join public.rule_weapons rw
      on rw.id::text=coalesce(w.value->>'weapon_id',w.value->>'weaponTypeId')
    left join public.rule_skills rs on rs.id=rw.skill_id
  ),'[]'::jsonb),
  true
)
where jsonb_array_length(coalesce(c.data->'weapons','[]'::jsonb))>0;
