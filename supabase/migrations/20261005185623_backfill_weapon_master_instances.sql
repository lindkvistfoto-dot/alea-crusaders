-- Link legacy actor weapon instances to the central master registry.
-- Existing non-empty instance values win over master defaults.

with rebuilt as (
  select c.id,
         jsonb_agg(
           case when r.id is null then e.item else
             jsonb_strip_nulls(
               e.item || jsonb_build_object(
                 'weaponTypeId', r.id,
                 'weapon_id', r.id,
                 'weaponCategory', coalesce(nullif(e.item->>'weaponCategory',''),r.category),
                 'handling', coalesce(nullif(e.item->>'handling',''),r.handling),
                 'strengthGroup', case when nullif(e.item->>'strengthGroup','') is not null then e.item->'strengthGroup' else to_jsonb(r.strength_group) end,
                 'damage', coalesce(nullif(e.item->>'damage',''),r.damage),
                 'length', case when nullif(e.item->>'length','') is not null then e.item->'length' else to_jsonb(r.weapon_length) end,
                 'bep', case
                          when nullif(e.item->>'bep','') is not null then e.item->'bep'
                          when nullif(e.item->>'weight','') is not null then e.item->'weight'
                          else to_jsonb(r.bep)
                        end,
                 'weight', case
                             when nullif(e.item->>'bep','') is not null then e.item->'bep'
                             when nullif(e.item->>'weight','') is not null then e.item->'weight'
                             else to_jsonb(r.bep)
                           end,
                 'bv', case when nullif(e.item->>'bv','') is not null then e.item->'bv' else to_jsonb(r.bv) end,
                 'weaponType', coalesce(nullif(e.item->>'weaponType',''),r.weapon_type),
                 'price', case when nullif(e.item->>'price','') is not null then e.item->'price' else to_jsonb(r.price) end,
                 'range', coalesce(nullif(e.item->>'range',''),r.range_text),
                 'reloadRounds', case when nullif(e.item->>'reloadRounds','') is not null then e.item->'reloadRounds' else to_jsonb(r.reload_rounds) end,
                 'tags', case
                           when jsonb_typeof(e.item->'tags')='array' and jsonb_array_length(e.item->'tags')>0 then e.item->'tags'
                           else to_jsonb(r.tags)
                         end,
                 'masterNotes', coalesce(nullif(e.item->>'masterNotes',''),r.notes)
               )
             )
           end
           order by e.ord
         ) as weapons
  from public.characters c
  cross join lateral jsonb_array_elements(coalesce(c.data->'weapons','[]'::jsonb)) with ordinality e(item,ord)
  left join public.rule_weapons r
    on lower(r.name)=lower(case when lower(e.item->>'name')='stav' then 'trästav' else e.item->>'name' end)
  group by c.id
)
update public.characters c
set data=jsonb_set(c.data,'{weapons}',rebuilt.weapons,true),
    updated_at=now()
from rebuilt
where c.id=rebuilt.id;

with rebuilt as (
  select n.id,
         jsonb_agg(
           case when r.id is null then e.item else
             jsonb_strip_nulls(
               e.item || jsonb_build_object(
                 'weaponTypeId', r.id,
                 'weapon_id', r.id,
                 'weaponCategory', coalesce(nullif(e.item->>'weaponCategory',''),r.category),
                 'handling', coalesce(nullif(e.item->>'handling',''),r.handling),
                 'strengthGroup', case when nullif(e.item->>'strengthGroup','') is not null then e.item->'strengthGroup' else to_jsonb(r.strength_group) end,
                 'damage', coalesce(nullif(e.item->>'damage',''),r.damage),
                 'length', case when nullif(e.item->>'length','') is not null then e.item->'length' else to_jsonb(r.weapon_length) end,
                 'bep', case
                          when nullif(e.item->>'bep','') is not null then e.item->'bep'
                          when nullif(e.item->>'weight','') is not null then e.item->'weight'
                          else to_jsonb(r.bep)
                        end,
                 'weight', case
                             when nullif(e.item->>'bep','') is not null then e.item->'bep'
                             when nullif(e.item->>'weight','') is not null then e.item->'weight'
                             else to_jsonb(r.bep)
                           end,
                 'bv', case when nullif(e.item->>'bv','') is not null then e.item->'bv' else to_jsonb(r.bv) end,
                 'weaponType', coalesce(nullif(e.item->>'weaponType',''),r.weapon_type),
                 'price', case when nullif(e.item->>'price','') is not null then e.item->'price' else to_jsonb(r.price) end,
                 'range', coalesce(nullif(e.item->>'range',''),r.range_text),
                 'reloadRounds', case when nullif(e.item->>'reloadRounds','') is not null then e.item->'reloadRounds' else to_jsonb(r.reload_rounds) end,
                 'tags', case
                           when jsonb_typeof(e.item->'tags')='array' and jsonb_array_length(e.item->'tags')>0 then e.item->'tags'
                           else to_jsonb(r.tags)
                         end,
                 'masterNotes', coalesce(nullif(e.item->>'masterNotes',''),r.notes)
               )
             )
           end
           order by e.ord
         ) as weapons
  from public.campaign_npcs n
  cross join lateral jsonb_array_elements(coalesce(n.weapons,'[]'::jsonb)) with ordinality e(item,ord)
  left join public.rule_weapons r
    on lower(r.name)=lower(case when lower(e.item->>'name')='stav' then 'trästav' else e.item->>'name' end)
  group by n.id
)
update public.campaign_npcs n
set weapons=rebuilt.weapons,
    updated_at=now()
from rebuilt
where n.id=rebuilt.id;

with rebuilt as (
  select m.id,
         jsonb_agg(
           case when r.id is null then e.item else
             jsonb_strip_nulls(
               e.item || jsonb_build_object(
                 'weaponTypeId', r.id,
                 'weapon_id', r.id,
                 'weaponCategory', coalesce(nullif(e.item->>'weaponCategory',''),r.category),
                 'handling', coalesce(nullif(e.item->>'handling',''),r.handling),
                 'strengthGroup', case when nullif(e.item->>'strengthGroup','') is not null then e.item->'strengthGroup' else to_jsonb(r.strength_group) end,
                 'damage', coalesce(nullif(e.item->>'damage',''),r.damage),
                 'length', case when nullif(e.item->>'length','') is not null then e.item->'length' else to_jsonb(r.weapon_length) end,
                 'bep', case
                          when nullif(e.item->>'bep','') is not null then e.item->'bep'
                          when nullif(e.item->>'weight','') is not null then e.item->'weight'
                          else to_jsonb(r.bep)
                        end,
                 'weight', case
                             when nullif(e.item->>'bep','') is not null then e.item->'bep'
                             when nullif(e.item->>'weight','') is not null then e.item->'weight'
                             else to_jsonb(r.bep)
                           end,
                 'bv', case when nullif(e.item->>'bv','') is not null then e.item->'bv' else to_jsonb(r.bv) end,
                 'weaponType', coalesce(nullif(e.item->>'weaponType',''),r.weapon_type),
                 'price', case when nullif(e.item->>'price','') is not null then e.item->'price' else to_jsonb(r.price) end,
                 'range', coalesce(nullif(e.item->>'range',''),r.range_text),
                 'reloadRounds', case when nullif(e.item->>'reloadRounds','') is not null then e.item->'reloadRounds' else to_jsonb(r.reload_rounds) end,
                 'tags', case
                           when jsonb_typeof(e.item->'tags')='array' and jsonb_array_length(e.item->'tags')>0 then e.item->'tags'
                           else to_jsonb(r.tags)
                         end,
                 'masterNotes', coalesce(nullif(e.item->>'masterNotes',''),r.notes)
               )
             )
           end
           order by e.ord
         ) as weapons
  from public.campaign_monsters m
  cross join lateral jsonb_array_elements(coalesce(m.weapons,'[]'::jsonb)) with ordinality e(item,ord)
  left join public.rule_weapons r
    on lower(r.name)=lower(case when lower(e.item->>'name')='stav' then 'trästav' else e.item->>'name' end)
  group by m.id
)
update public.campaign_monsters m
set weapons=rebuilt.weapons,
    updated_at=now()
from rebuilt
where m.id=rebuilt.id;
