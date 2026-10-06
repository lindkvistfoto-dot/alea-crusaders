-- Extend Värdshus services with entertainer and mercenary.
insert into public.rule_inn_items
(item_key,category,name,description,price_amount,price_currency,unit_label,metadata,sort_order,active)
values
  ('service_entertainer','Tjänster','Underhållare','Musiker, sångare, sagoberättare eller annan underhållare för sällskapet under en kväll.',1,'SM','per kväll','{}'::jsonb,380,true),
  ('service_mercenary','Tjänster','Legosoldat','En beväpnad yrkeskämpe som kan hyras för eskort, vakthållning eller strid.',8,'SM','per dag','{}'::jsonb,390,true)
on conflict (item_key) do update
set category=excluded.category,
    name=excluded.name,
    description=excluded.description,
    price_amount=excluded.price_amount,
    price_currency=excluded.price_currency,
    unit_label=excluded.unit_label,
    metadata=excluded.metadata,
    sort_order=excluded.sort_order,
    active=excluded.active,
    updated_at=now();
