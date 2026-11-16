-- Complete the central weapon master with Expert projectile/thrown weapons
-- plus the campaign's established Bastardsvärd master entry.

insert into public.rule_weapons
(category,handling,strength_group,name,damage,weapon_length,bep,bv,weapon_type,price,range_text,reload_rounds,notes,sort_order,tags)
values
-- Projectile weapons, Drakar och Demoner Expert p. 58
('projectile','2H',1,'Liten båge','1T4+1',null,1,null,'L',125,'135 m',0,'',10,array['bow','projectile']::text[]),
('projectile','2H',2,'Kortbåge','1T6+1',null,2,null,'L',190,'135 m',0,'',20,array['bow','projectile']::text[]),
('projectile','2H',3,'Långbåge','1T8+1',null,2,null,'T',250,'180 m',0,'',30,array['bow','projectile']::text[]),
('projectile','2H',3,'Sammansatt båge','1T10+1',null,2,null,'T',500,'180 m',0,'',40,array['bow','projectile']::text[]),
('projectile','1H',1,'Slunga','1T6',null,0.25,null,'L',12,'90 m',0,'',50,array['sling','projectile']::text[]),
('projectile','2H',2,'Stavslunga','1T8',null,1,null,'L',50,'120 m',1,'',60,array['staff_sling','projectile']::text[]),
('projectile','2H',1,'Blåsrör','Spec.',4,2,null,'T',50,'20 m',0,'',70,array['blowgun','projectile']::text[]),
('projectile','2H',2,'Lätt armborst','2T4+2',0,2,9,'L',310,'150 m',3,'',80,array['crossbow','projectile']::text[]),
('projectile','2H',2,'Tungt armborst','2T6+2',1,2,11,'T',625,'225 m',6,'',90,array['crossbow','projectile']::text[]),
('projectile','2H',3,'Arbalest','3T6+3',1,3,11,'T',750,'250 m',12,'',100,array['crossbow','projectile']::text[]),

-- Thrown weapons, Drakar och Demoner Expert p. 58
('thrown','1H',1,'Kaststjärna','1T4',null,0.2,null,'L',30,'SMI×1 rutor',0,'',10,array['thrown','star']::text[]),
('thrown','1H',1,'Kastspjut','1T6+1',2,2,9,'L',100,'STY×1 rutor',0,'',20,array['thrown','spear','spear_point']::text[]),
('thrown','1H',1,'Kastkniv','1T4+1',null,0.5,9,'L',75,'STY×1 rutor',0,'',30,array['thrown','dagger','edged']::text[]),
('thrown','1H',2,'Kastyxa','1T6+2',1,1,11,'L',90,'STY×1 rutor',0,'',40,array['thrown','axe','edged']::text[]),
('thrown','1H',2,'Bola','Spec.',1,1,null,'L',5,'STY×1 rutor',0,'',50,array['thrown','bola']::text[]),
('thrown','2H',1,'Lasso','Spec.',5,2,5,'L',1,'7 rutor',0,'',60,array['thrown','lasso']::text[]),

-- Campaign master entry used by an existing character.
('melee','1-2H',4,'Bastardsvärd','1T10+1',1,2,15,'T',2500,'',null,
 'Kampanjkomplettering till Expert-listan; individuella kopior kan ändras utan att mastern påverkas.',
 440,array['sword','edged','campaign']::text[])
on conflict (category,name) do update set
  handling=excluded.handling,
  strength_group=excluded.strength_group,
  damage=excluded.damage,
  weapon_length=excluded.weapon_length,
  bep=excluded.bep,
  bv=excluded.bv,
  weapon_type=excluded.weapon_type,
  price=excluded.price,
  range_text=excluded.range_text,
  reload_rounds=excluded.reload_rounds,
  notes=excluded.notes,
  sort_order=excluded.sort_order,
  tags=excluded.tags,
  updated_at=now();
