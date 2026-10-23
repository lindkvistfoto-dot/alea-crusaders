insert into public.rule_races (id,name,category,description,sort_order)
values
  ('halvalv','Halvalv','','',220),
  ('halvorch','Halvorch','','',230)
on conflict (id) do update
set name=excluded.name,
    category=excluded.category,
    sort_order=excluded.sort_order,
    updated_at=now();

insert into public.rule_race_attributes (race_id,attribute_key,sort_order)
select r.id,a.attribute_key,a.sort_order
from public.rule_races r
cross join (values
  ('STY',10),('FYS',20),('STO',30),('SMI',40),('INT',50),('PSY',60),('KAR',70)
) as a(attribute_key,sort_order)
where r.id in ('halvalv','halvorch')
on conflict (race_id,attribute_key) do nothing;

with vals(race_id,attribute_key,roll_formula,typical_value) as (
  values
    ('halvalv','STY','3T6',11),
    ('halvalv','FYS','3T6',11),
    ('halvalv','STO','2T6+6',13),
    ('halvalv','SMI','3T6+2',13),
    ('halvalv','INT','3T6',11),
    ('halvalv','PSY','3T6',11),
    ('halvalv','KAR','3T6+1',12),

    ('halvorch','STY','3T6+2',13),
    ('halvorch','FYS','3T6+2',13),
    ('halvorch','STO','2T6+4',11),
    ('halvorch','SMI','2T6+2',10),
    ('halvorch','INT','3T6',11),
    ('halvorch','PSY','3T6',11),
    ('halvorch','KAR','2T6+1',8)
)
update public.rule_race_attributes r
set roll_formula=v.roll_formula,
    typical_value=v.typical_value,
    updated_at=now()
from vals v
where r.race_id=v.race_id
  and r.attribute_key=v.attribute_key;
