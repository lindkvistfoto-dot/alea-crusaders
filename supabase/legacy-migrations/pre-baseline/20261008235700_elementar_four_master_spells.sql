-- v0.34.99: split FRAMMANA/SKICKA BORT ELEMENTAR into one independent
-- master spell per element, preserving personal FV/ERF and existing UUIDs.
-- The original master's UUID becomes FIRE, so Lyra's FV 12 link remains valid.
-- Re-runnable: no duplicate spells or NPC spells, no overwrite of non-null FV.
update public.rule_spells
set spell_key='frammana-skicka-bort-elementar-eld',
    name='FRAMMANA/SKICKA BORT ELEMENTAR – ELD (F)',
    fysisk=true,
    target_text='Eld (salamander)',
    notes=case when position('Inriktning: eld' in coalesce(notes,''))>0 then notes
      else trim(coalesce(notes,'') || ' · Inriktning: eld (salamander).') end,
    updated_at=now()
where spell_key in ('frammana-skicka-bort-elementar','frammana-skicka-bort-elementar-eld');

with variants(spell_key,name,element,creature,sort_order) as (
 values
 ('frammana-skicka-bort-elementar-luft','FRAMMANA/SKICKA BORT ELEMENTAR – LUFT (F)','Luft','sylf',441),
 ('frammana-skicka-bort-elementar-jord','FRAMMANA/SKICKA BORT ELEMENTAR – JORD (F)','Jord','gnom',442),
 ('frammana-skicka-bort-elementar-vatten','FRAMMANA/SKICKA BORT ELEMENTAR – VATTEN (F)','Vatten','undin',443)
)
insert into public.rule_spells
(spell_key,name,school_id,school_value,range_text,duration_text,psy_cost_text,
 target_text,effect_per_eg,resistance_text,description,notes,source_label,
 canonical_expert,sort_order,kvick,fysisk,ritual,attack_magic,damage_text,playtested)
select v.spell_key,v.name,base.school_id,base.school_value,base.range_text,
 base.duration_text,base.psy_cost_text,v.element||' ('||v.creature||')',
 base.effect_per_eg,base.resistance_text,base.description,
 'F. Magiboken s.16 · Inriktning: '||lower(v.element)||' ('||v.creature||').',
 base.source_label,base.canonical_expert,v.sort_order,base.kvick,true,
 base.ritual,base.attack_magic,base.damage_text,false
from variants v
cross join public.rule_spells base
where base.spell_key='frammana-skicka-bort-elementar-eld'
on conflict (spell_key) do nothing;

-- Correct readable names and link any older free-text generic spell to FIRE.
with fire as (
 select id,name from public.rule_spells
 where spell_key='frammana-skicka-bort-elementar-eld'
)
update public.characters c
set data=jsonb_set(c.data,'{spells}',(
 select jsonb_agg(
   case when elem->>'rule_id'=fire.id::text
      or upper(elem->>'name')='FRAMMANA/SKICKA BORT ELEMENTAR (F)'
    then jsonb_set(jsonb_set(elem,'{rule_id}',to_jsonb(fire.id::text),true),
         '{name}',to_jsonb(fire.name),true)
    else elem end order by position
 )
 from jsonb_array_elements(c.data->'spells') with ordinality as items(elem,position)
),false)
from fire
where jsonb_typeof(c.data->'spells')='array'
and exists (
 select 1 from jsonb_array_elements(c.data->'spells') elem
 where elem->>'rule_id'=fire.id::text
   or upper(elem->>'name')='FRAMMANA/SKICKA BORT ELEMENTAR (F)'
);

-- The two spell-test NPCs already know every registered spell at FV 15.
-- Convert their old generic elementar entry to FIRE and append the other three.
with fire as (
 select id,name from public.rule_spells
 where spell_key='frammana-skicka-bort-elementar-eld'
)
update public.campaign_npcs n
set spells=(
 select jsonb_agg(
   case when elem->>'rule_id'=fire.id::text
     or upper(elem->>'name')='FRAMMANA/SKICKA BORT ELEMENTAR (F)'
    then jsonb_set(jsonb_set(elem,'{rule_id}',to_jsonb(fire.id::text),true),
         '{name}',to_jsonb(fire.name),true)
    else elem end order by position
 )
 from jsonb_array_elements(n.spells) with ordinality as items(elem,position)
),
updated_at=now()
from fire
where jsonb_typeof(n.spells)='array'
and exists (
 select 1 from jsonb_array_elements(n.spells) elem
 where elem->>'rule_id'=fire.id::text
   or upper(elem->>'name')='FRAMMANA/SKICKA BORT ELEMENTAR (F)'
);

update public.campaign_npcs n
set spells=n.spells || coalesce((
 select jsonb_agg(jsonb_build_object(
  'rule_id',v.id,'name',v.name,'school_id',v.school_id,
  'fv',15,'erf',0,'school_fv',15
 ) order by v.sort_order)
 from public.rule_spells v
 where v.spell_key in (
   'frammana-skicka-bort-elementar-luft',
   'frammana-skicka-bort-elementar-jord',
   'frammana-skicka-bort-elementar-vatten'
 )
 and not exists(
  select 1 from jsonb_array_elements(n.spells) entry
  where entry->>'rule_id'=v.id::text
 )
),'[]'::jsonb),
updated_at=now()
where n.npc_key in ('magic-test-eldra','magic-test-nox')
and jsonb_typeof(n.spells)='array';
