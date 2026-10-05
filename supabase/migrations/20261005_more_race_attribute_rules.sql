
with vals(race_id,attribute_key,roll_formula,typical_value) as (
  values
    ('anka','STY','2T6',7),
    ('anka','FYS','2T6+6',13),
    ('anka','STO','1T4+2',5),
    ('anka','SMI','2T6+6',13),
    ('anka','INT','3T6',11),
    ('anka','PSY','3T6',11),
    ('anka','KAR','2T6+1',8),

    ('kattman','STY','2T6+4',11),
    ('kattman','FYS','2T6+5',12),
    ('kattman','STO','2T3+4',8),
    ('kattman','SMI','2T6+9',16),
    ('kattman','INT','2T6+6',13),
    ('kattman','PSY','3T6',11),
    ('kattman','KAR','3T6',11),

    ('dvarg','STY','4T6',14),
    ('dvarg','FYS','2T6+6',13),
    ('dvarg','STO','2T4+2',7),
    ('dvarg','SMI','3T6',11),
    ('dvarg','INT','3T6',11),
    ('dvarg','PSY','2T6+6',13),
    ('dvarg','KAR','3T6',11),

    ('orch','STY','4T6',14),
    ('orch','FYS','3T6',11),
    ('orch','STO','3T6',11),
    ('orch','SMI','2T6+3',10),
    ('orch','INT','3T6',11),
    ('orch','PSY','3T6',11),
    ('orch','KAR','2T6',7)
)
update public.rule_race_attributes r
set roll_formula=v.roll_formula,
    typical_value=v.typical_value,
    updated_at=now()
from vals v
where r.race_id=v.race_id
  and r.attribute_key=v.attribute_key;
