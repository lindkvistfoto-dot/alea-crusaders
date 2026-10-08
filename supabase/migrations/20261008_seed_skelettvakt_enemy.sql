-- Kampanjmall: Skelettvakt (en fiendetyp, en instans per tillägg i strid).
-- Ur Expert: slå en ursprunglig människas egenskaper och härled därefter
-- skelettets STY, FYS, STO, SMI, INT, PSY och KAR.
-- Resultatet läggs in EN GÅNG och ändras inte av en omkörning av migrationen.
with original as materialized (
 select
  (select sum(1+floor(random()*6)::int)::int from generate_series(1,3)) as sty,
  (select sum(1+floor(random()*6)::int)::int from generate_series(1,3)) as fys,
  (select 6+sum(1+floor(random()*6)::int)::int from generate_series(1,2)) as sto,
  (select sum(1+floor(random()*6)::int)::int from generate_series(1,3)) as smi,
  (select sum(1+floor(random()*6)::int)::int from generate_series(1,3)) as intel,
  (select sum(1+floor(random()*6)::int)::int from generate_series(1,3)) as psy,
  (select sum(1+floor(random()*6)::int)::int from generate_series(1,3)) as kar
),
skeleton as materialized (
 select *,
  sty+floor(random()*(sty+1))::int as skeleton_sty, -- original STY to 2 x STY
  greatest(1,1+floor(random()*smi)::int) as skeleton_smi, -- at most original SMI
  floor(random()*(floor(intel/4.0)::int+1))::int as skeleton_int, -- max 1/4 INT
  1+floor(random()*psy)::int as skeleton_psy -- PSY at least 1
 from original
),
campaign as (
 select id from public.campaigns where name='Skelettbyns Hemlighet'
),
weapon as (
 select * from public.rule_weapons
 where name='Kortsvärd' and skill_id='enhandssvard'
)
insert into public.campaign_monsters (
 campaign_id,monster_key,name,actor_kind,monster_type,quantity,
 title,race,description,gm_notes,player_visible,active,
 attributes,skills,weapons,shield,armor,updated_at
)
select
 c.id,'skelettvakt','Skelettvakt','enemy','Odöd',1,
 'Förfallen vakt','Skelett',
 'En skelettvakt med rostigt kortsvärd. Dess ögonhålor är tomma, men klingan höjs när inkräktare närmar sig.',
 format(
  'Expert: ursprunglig människa slumpades STY %s, FYS %s, STO %s, SMI %s, INT %s, PSY %s, KAR %s. Härledning: STY upp till ×2, FYS 0, STO ×1, SMI upp till ×1, INT upp till ×¼, PSY 1+, KAR 1. Naturligt skydd 0. Förflyttning original −4. Naturliga attacker: nävar 35%% 1T3; spark 35%% 1T6. SVF 35%%. Pilar, stick- och stötvapen ingen skada; huggvapen halv; krossvapen normal skada. Skadeundantagen kräver tills vidare SL-bedömning i stridsmotorn.',
  s.sty,s.fys,s.sto,s.smi,s.intel,s.psy,s.kar
 ),
 false,true,
 jsonb_build_object(
  'STY',s.skeleton_sty,'FYS',0,'STO',s.sto,'SMI',s.skeleton_smi,
  'INT',s.skeleton_int,'PSY',s.skeleton_psy,'KAR',1
 ),
 jsonb_build_array(
  jsonb_build_object('skill_id','enhandssvard','name','Enhandssvärd','fv',8),
  jsonb_build_object('skill_id','smyga','name','Smyga','fv',95)
 ),
 jsonb_build_array(
  jsonb_build_object(
   'weapon_id',w.id,'weaponTypeId',w.id,'name',w.name,'fv',8,
   'damage',w.damage,'bv',w.bv,'bep',w.bep,'price',w.price,
   'range',coalesce(w.range_text,''),'length',w.weapon_length,
   'handling',w.handling,'weaponType',w.weapon_type,
   'strengthGroup',w.strength_group,'weaponCategory',w.category,
   'tags',to_jsonb(w.tags),'skill_id',w.skill_id,
   'masterNotes',coalesce(w.notes,'')
  )
 ),
 jsonb_build_object('bv',null,'fv',null,'name',''),
 jsonb_build_object('name','','absorption',0),
 now()
from campaign c cross join skeleton s cross join weapon w
where not exists (
 select 1 from public.campaign_monsters existing
 where existing.campaign_id=c.id
   and (existing.monster_key='skelettvakt' or existing.name='Skelettvakt')
);
