create table if not exists public.rule_inn_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  category text not null,
  name text not null,
  description text not null default '',
  price_amount integer not null check (price_amount >= 0),
  price_currency text not null check (price_currency in ('GM','SM','KM')),
  unit_label text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rule_inn_items_category_check check (category in ('Boende','Mat & dryck','Tjänster'))
);

alter table public.rule_inn_items enable row level security;

revoke all on table public.rule_inn_items from anon;
grant select, insert, update, delete on table public.rule_inn_items to authenticated;
grant all on table public.rule_inn_items to service_role;

drop policy if exists "rule_inn_items_read" on public.rule_inn_items;
create policy "rule_inn_items_read"
on public.rule_inn_items for select to authenticated
using (true);

drop policy if exists "rule_inn_items_insert_admin" on public.rule_inn_items;
create policy "rule_inn_items_insert_admin"
on public.rule_inn_items for insert to authenticated
with check (private.is_admin());

drop policy if exists "rule_inn_items_update_admin" on public.rule_inn_items;
create policy "rule_inn_items_update_admin"
on public.rule_inn_items for update to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists "rule_inn_items_delete_admin" on public.rule_inn_items;
create policy "rule_inn_items_delete_admin"
on public.rule_inn_items for delete to authenticated
using (private.is_admin());

insert into public.rule_inn_items
(item_key,category,name,description,price_amount,price_currency,unit_label,metadata,sort_order,active)
values
  ('lodging_suite','Boende','Svit','Ett rymligt privat rum med bättre sängar och plats för upp till tre personer.',6,'SM','per natt','{"capacity":3}'::jsonb,10,true),
  ('lodging_single','Boende','Enkelrum','Eget rum med säng, tvättfat och låsbar dörr.',3,'SM','per natt','{"capacity":1}'::jsonb,20,true),
  ('lodging_shared','Boende','Flerbäddsrum','Sängplats i ett mindre rum som delas med andra gäster.',1,'SM','per person och natt','{}'::jsonb,30,true),
  ('lodging_dorm','Boende','Sovsal','En enkel bädd i värdshusets gemensamma sovsal.',5,'KM','per person och natt','{}'::jsonb,40,true),
  ('lodging_stable','Boende','Stall','Spilta, vatten och hö för riddjur eller packdjur.',4,'KM','per djur och natt','{}'::jsonb,50,true),

  ('food_breakfast_simple','Mat & dryck','Enkel frukost','Bröd, ost eller gröt och en enkel dryck.',3,'KM','per portion','{}'::jsonb,110,true),
  ('food_breakfast_hearty','Mat & dryck','Stadig frukost','Varm gröt, bröd, ost, ägg och dryck.',6,'KM','per portion','{}'::jsonb,120,true),
  ('food_soup','Mat & dryck','Soppa & bröd','Dagens gryta eller soppa med grovt bröd.',4,'KM','per portion','{}'::jsonb,130,true),
  ('food_hot_meal','Mat & dryck','Varm måltid','Kött eller fisk, rotsaker och bröd.',8,'KM','per portion','{}'::jsonb,140,true),
  ('food_fine_meal','Mat & dryck','Fin måltid','En bättre tillagad måltid med flera tillbehör.',2,'SM','per portion','{}'::jsonb,150,true),
  ('food_feast','Mat & dryck','Festmåltid','Rejält bord med flera rätter för den som vill äta riktigt gott.',5,'SM','per person','{}'::jsonb,160,true),
  ('food_travel_ration','Mat & dryck','Reskost, 1 dag','Hållbar proviant packad för en dags färd.',8,'KM','per dagsranson','{}'::jsonb,170,true),
  ('drink_ale','Mat & dryck','Öl','En sejdel av husets öl.',2,'KM','per sejdel','{}'::jsonb,180,true),
  ('drink_ale_pitcher','Mat & dryck','Kanna öl','En kanna öl att dela vid bordet.',6,'KM','per kanna','{}'::jsonb,190,true),
  ('drink_wine_glass','Mat & dryck','Vin, glas','Ett glas enklare vin.',5,'KM','per glas','{}'::jsonb,200,true),
  ('drink_wine_bottle','Mat & dryck','Vin, flaska','En flaska av värdshusets bättre bordsvin.',2,'SM','per flaska','{}'::jsonb,210,true),

  ('service_pathfinder','Tjänster','Stigfinnare','En lokalkunnig stigfinnare följer sällskapet och hjälper till att hitta rätt väg.',5,'SM','per dag','{}'::jsonb,310,true),
  ('service_seamstress','Tjänster','Sömmerska','Lagning och enklare ändring av kläder, mantlar och tygutrustning.',1,'SM','per arbete','{}'::jsonb,320,true),
  ('service_laundry','Tjänster','Tvätt av kläder','Tvätt och torkning av ett normalt ombyte kläder.',5,'KM','per omgång','{}'::jsonb,330,true),
  ('service_bath','Tjänster','Bad','Varmt vatten, balja, tvål och handduk.',3,'KM','per person','{}'::jsonb,340,true),
  ('service_messenger','Tjänster','Budbärare','Ett lokalt bud inom byn eller staden.',5,'KM','per uppdrag','{}'::jsonb,350,true),
  ('service_scribe','Tjänster','Skrivare','Hjälp att skriva eller renskriva ett kort brev eller dokument.',1,'SM','per brev','{}'::jsonb,360,true),
  ('service_horse_care','Tjänster','Hästskötsel','Ryktning, hovkontroll och enklare omvårdnad av ett riddjur.',4,'KM','per djur','{}'::jsonb,370,true)
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
