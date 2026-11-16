-- DoD Expert: Skelett (Oklassificerad). Values are based on the original
-- creature; they are not stand-alone dice-roll formulas.
alter table public.rule_race_attributes
 add column if not exists source_rule text not null default '';

insert into public.rule_races(id,name,category,description,sort_order,updated_at)
values (
 'skelett','Skelett','Oklassificerad',
 E'Ett besjälat skelett som utgår från den ursprungliga varelsens värden.\n'
 ||E'Hemvist: där det finns människor. Vanlighet: sällsynt. Antal: 3T10.\n'
 ||E'Grundegenskaper: STY upp till ×2 av ursprungligt värde; STO ×1; FYS 0; SMI upp till ×1; INT upp till ×¼; PSY minst 1; KAR 1.\n'
 ||E'Naturliga attacker: 2 nävar, GC 35 %, skada 1T3; 1 spark, GC 35 %, skada 1T6. Naturligt skydd: 0.\n'
 ||E'Förflyttning: 4 lägre än den ursprungliga varelsens. Färdigheter: Smyga 95 %, SVF 35 %.\n'
 ||E'Skador: pilar, stickvapen och stötvapen skadar inte skelett. Huggvapen ger halv skada. Krossvapen ger normal skada.\n'
 ||E'Skelett kan bruka vapen och enklare utrustning från sin tidigare tillvaro. Särskilda utrustningsdetaljer avgörs av SL.\n'
 ||E'Rasens härledda egenskaper ska fastställas utifrån ursprunglig varelse och SL:s bedömning; använd inte vanliga ras-tärningsslag.',
 300,now()
)
on conflict(id) do update set
 name=excluded.name,category=excluded.category,
 description=excluded.description,sort_order=excluded.sort_order,updated_at=now();

with rules(attribute_key,source_rule,typical_value,sort_order) as (
 values
 ('STY','Upp till ×2 av den ursprungliga varelsens STY',null::integer,10),
 ('FYS','Alltid 0',0,20),
 ('STO','×1 av den ursprungliga varelsens STO',null::integer,30),
 ('SMI','Upp till ×1 av den ursprungliga varelsens SMI',null::integer,40),
 ('INT','Upp till ×¼ av den ursprungliga varelsens INT',null::integer,50),
 ('PSY','1+ (minst 1; SL fastställer värdet)',null::integer,60),
 ('KAR','Alltid 1',1,70)
)
insert into public.rule_race_attributes
(race_id,attribute_key,source_rule,roll_formula,typical_value,sort_order,updated_at)
select 'skelett', attribute_key, source_rule, null,typical_value,sort_order,now() from rules
on conflict (race_id,attribute_key) do update set
 source_rule=excluded.source_rule,roll_formula=excluded.roll_formula,
 typical_value=excluded.typical_value,sort_order=excluded.sort_order,updated_at=now();
