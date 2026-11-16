with vals(race_id,attribute_key,roll_formula,typical_value) as (
  values
    ('svartalf','STY','2T6+2',9),
    ('svartalf','FYS','3T6',11),
    ('svartalf','STO','2T4+2',7),
    ('svartalf','SMI','3T6',11),
    ('svartalf','INT','2T6+2',9),
    ('svartalf','PSY','3T6',11),
    ('svartalf','KAR','2T6',7),

    ('svartnisse','STY','2T4',5),
    ('svartnisse','FYS','2T6',7),
    ('svartnisse','STO','1T2+1',3),
    ('svartnisse','SMI','3T6',11),
    ('svartnisse','INT','2T6+1',8),
    ('svartnisse','PSY','3T6',11),
    ('svartnisse','KAR','2T6',7),

    ('skogsalv','STY','2T6+3',10),
    ('skogsalv','FYS','3T6',11),
    ('skogsalv','STO','2T6+2',9),
    ('skogsalv','SMI','3T6+3',14),
    ('skogsalv','INT','4T6',14),
    ('skogsalv','PSY','3T6',11),
    ('skogsalv','KAR','3T6+2',13),

    ('grottalv','STY','2T6+3',10),
    ('grottalv','FYS','3T6',11),
    ('grottalv','STO','2T6+2',9),
    ('grottalv','SMI','3T6+3',14),
    ('grottalv','INT','4T6',14),
    ('grottalv','PSY','3T6',11),
    ('grottalv','KAR','3T6+2',13),

    ('graalv','STY','2T6+3',10),
    ('graalv','FYS','3T6',11),
    ('graalv','STO','2T6+2',9),
    ('graalv','SMI','3T6+3',14),
    ('graalv','INT','4T6',14),
    ('graalv','PSY','3T6',11),
    ('graalv','KAR','3T6+2',13),

    ('silveralv','STY','2T6+3',10),
    ('silveralv','FYS','3T6',11),
    ('silveralv','STO','2T6+2',9),
    ('silveralv','SMI','3T6+3',14),
    ('silveralv','INT','4T6',14),
    ('silveralv','PSY','3T6',11),
    ('silveralv','KAR','3T6+2',13),

    ('karkion','STY','3T6',11),
    ('karkion','FYS','4T6',14),
    ('karkion','STO','2T4+3',8),
    ('karkion','SMI','4T6',14),
    ('karkion','INT','3T6+6',17),
    ('karkion','PSY','3T6+6',17),
    ('karkion','KAR','3T6',11),

    ('kentaur','STY','3T6+6',17),
    ('kentaur','FYS','3T6',11),
    ('kentaur','STO','4T6+12',26),
    ('kentaur','SMI','3T6',11),
    ('kentaur','INT','3T6',11),
    ('kentaur','PSY','3T6',11),
    ('kentaur','KAR','3T6',11),

    ('rese','STY','3T6+24',35),
    ('rese','FYS','2T6+6',13),
    ('rese','STO','3T6+12',23),
    ('rese','SMI','2T6+3',10),
    ('rese','INT','2T6',7),
    ('rese','PSY','3T6',11),
    ('rese','KAR','2T4',5)
)
update public.rule_race_attributes r
set roll_formula=v.roll_formula,
    typical_value=v.typical_value,
    updated_at=now()
from vals v
where r.race_id=v.race_id
  and r.attribute_key=v.attribute_key;
