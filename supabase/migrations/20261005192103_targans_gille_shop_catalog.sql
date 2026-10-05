create table if not exists public.rule_shop_items (
  id uuid primary key default gen_random_uuid(),
  item_key text not null unique,
  category text not null,
  name text not null,
  description text not null default '',
  bep numeric(8,2) null check (bep is null or bep >= 0),
  price_amount integer not null check (price_amount >= 0),
  price_currency text not null check (price_currency in ('GM','SM','KM')),
  purchase_kind text not null check (purchase_kind in ('equipment','projectile','armor','shield','transport')),
  quantity_per_purchase integer not null default 1 check (quantity_per_purchase > 0),
  metadata jsonb not null default '{}'::jsonb,
  source_key text not null default '',
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.rule_shop_items enable row level security;

drop policy if exists rule_shop_items_select on public.rule_shop_items;
create policy rule_shop_items_select on public.rule_shop_items
for select to authenticated using (true);

drop policy if exists rule_shop_items_insert on public.rule_shop_items;
create policy rule_shop_items_insert on public.rule_shop_items
for insert to authenticated with check ((select private.is_admin()));

drop policy if exists rule_shop_items_update on public.rule_shop_items;
create policy rule_shop_items_update on public.rule_shop_items
for update to authenticated
using ((select private.is_admin())) with check ((select private.is_admin()));

drop policy if exists rule_shop_items_delete on public.rule_shop_items;
create policy rule_shop_items_delete on public.rule_shop_items
for delete to authenticated using ((select private.is_admin()));

grant select,insert,update,delete on public.rule_shop_items to authenticated;

insert into public.rule_shop_items
(item_key,category,name,description,bep,price_amount,price_currency,purchase_kind,quantity_per_purchase,metadata,source_key,sort_order)
values
('arrows_20','Vapentillbehör','Pilar, 20 st','Pilar till båge.',1,12,'SM','projectile',20,'{"projectile_name":"Pilar"}','grundregler_1988',10),
('crossbow_bolts_20','Vapentillbehör','Armborstpilar, 20 st','Lod/pilar till armborst.',1,25,'SM','projectile',20,'{"projectile_name":"Armborstpilar"}','grundregler_1988',20),
('bowstring','Vapentillbehör','Bågsträng','Reservsträng till båge.',0,1,'SM','equipment',1,'{}','grundregler_1988',30),
('sword_belt','Vapentillbehör','Svärdsbälte','Bälte avsett för att bära svärd.',0,12,'SM','equipment',1,'{}','grundregler_1988',40),
('sword_scabbard','Vapentillbehör','Svärdsskida','Skida till svärd.',0,25,'SM','equipment',1,'{}','grundregler_1988',50),
('quiver_20','Vapentillbehör','Koger (20 pilar)','Koger med plats för tjugo pilar.',0.5,10,'SM','equipment',1,'{}','grundregler_1988',60),
('backpack_small','Äventyr','Liten ryggsäck','Rymmer ungefär 2 BEP.',0.5,5,'SM','equipment',1,'{}','grundregler_1988',100),
('backpack_medium','Äventyr','Mellanstor ryggsäck','Rymmer ungefär 4 BEP.',1,10,'SM','equipment',1,'{}','grundregler_1988',110),
('backpack_large','Äventyr','Stor ryggsäck','Rymmer ungefär 5 BEP.',1,20,'SM','equipment',1,'{}','grundregler_1988',120),
('lantern','Äventyr','Lykta','Återanvändbar lykta för lampolja.',1,40,'SM','equipment',1,'{}','grundregler_1988',130),
('lamp_oil','Äventyr','Lampolja, 0,5 l','Räcker ungefär fem timmar.',0.25,25,'KM','equipment',1,'{}','grundregler_1988',140),
('torch','Äventyr','Fackla','Brinntid ungefär en timme.',0.25,1,'SM','equipment',1,'{}','grundregler_1988',150),
('tinderbox','Äventyr','Elddon','Flinta, stål och fnöske.',0.25,25,'KM','equipment',1,'{}','grundregler_1988',160),
('ember_box','Äventyr','Glödlåda','Behållare för att bevara glöd.',0.25,10,'SM','equipment',1,'{}','grundregler_1988',170),
('tent_hide_2','Äventyr','Skinntält, 2 personer','Tält av skinn för två personer.',8,190,'SM','equipment',1,'{}','grundregler_1988',180),
('tent_hide_4','Äventyr','Skinntält, 4 personer','Tält av skinn för fyra personer.',16,375,'SM','equipment',1,'{}','grundregler_1988',190),
('tent_hide_8','Äventyr','Skinntält, 8 personer','Tält av skinn för åtta personer.',25,875,'SM','equipment',1,'{}','grundregler_1988',200),
('blanket','Äventyr','Filt','Vanlig filt.',0.5,60,'SM','equipment',1,'{}','grundregler_1988',210),
('blanket_thick','Äventyr','Tjock filt','Tjock och varm filt.',1,125,'SM','equipment',1,'{}','grundregler_1988',220),
('sleeping_hide','Äventyr','Sovfäll','Varm fäll för vila och övernattning.',2,310,'SM','equipment',1,'{}','grundregler_1988',230),
('straw_mattress','Äventyr','Halmmadrass','Madrass utan halmfyllning.',0.5,25,'KM','equipment',1,'{}','grundregler_1988',240),
('mattress_straw_week','Äventyr','Madrasshalm, 1 vecka','Halm till en halmmadrass.',1,5,'KM','equipment',1,'{}','grundregler_1988',250),
('rope_10m','Äventyr','Rep, 10 m','Vanligt kraftigt rep.',1,12,'SM','equipment',1,'{}','grundregler_1988',260),
('grappling_hook','Äventyr','Änterhake','Krok för rep, klättring och bordning.',0.25,25,'SM','equipment',1,'{}','grundregler_1988',270),
('snares_3','Äventyr','Snaror, 3 st','Tre enkla snaror.',0.5,15,'KM','equipment',1,'{}','grundregler_1988',280),
('sack_small','Behållare','Liten säck','Rymmer ungefär 1 BEP.',0.25,10,'KM','equipment',1,'{}','grundregler_1988',300),
('sack_medium','Behållare','Mellanstor säck','Rymmer ungefär 2 BEP.',0.25,20,'KM','equipment',1,'{}','grundregler_1988',310),
('sack_large','Behållare','Stor säck','Rymmer ungefär 4 BEP.',0.25,30,'KM','equipment',1,'{}','grundregler_1988',320),
('sack_huge','Behållare','Jättesäck','Rymmer ungefär 8 BEP.',0.5,40,'KM','equipment',1,'{}','grundregler_1988',330),
('flask_05','Behållare','Fältflaska, 0,5 l','Liten flaska för dryck.',0,5,'SM','equipment',1,'{}','grundregler_1988',340),
('flask_1','Behållare','Fältflaska, 1 l','Flaska för dryck.',0.25,7,'SM','equipment',1,'{}','grundregler_1988',350),
('waterskin_4','Behållare','Vattenskinn, 4 l','Lädersäck för vatten.',0.5,12,'SM','equipment',1,'{}','grundregler_1988',360),
('belt_pouch','Behållare','Bältespung','Liten pung att bära i bältet.',0.25,5,'SM','equipment',1,'{}','grundregler_1988',370),
('pewter_flask','Behållare','Tennplunta','Liten plunta av tenn.',0,25,'SM','equipment',1,'{}','grundregler_1988',380),
('pickaxe','Verktyg','Hacka','Kraftig hacka.',1,125,'SM','equipment',1,'{}','grundregler_1988',400),
('large_nails_10','Verktyg','Grov spik, 10 st','Tio grova järnspikar.',0.25,50,'SM','equipment',1,'{}','grundregler_1988',410),
('crowbar','Verktyg','Kofot','Kofot av järn.',1,25,'SM','equipment',1,'{}','grundregler_1988',420),
('wooden_hammer','Verktyg','Trähammare','Hammare/klubba av trä.',0.5,20,'KM','equipment',1,'{}','grundregler_1988',430),
('wood_saw','Verktyg','Träsåg','Såg för träarbete.',1,60,'SM','equipment',1,'{}','grundregler_1988',440),
('travel_rations_day','Proviant','Reseproviant, 1 dag','Mat för en person under en dag.',0.5,16,'KM','equipment',1,'{}','grundregler_1988',500),
('wax_candle','Proviant','Vaxljus','Ett vaxljus.',0,8,'KM','equipment',1,'{}','grundregler_1988',510),
('cart_small_2wheel','Transport','Liten tvåhjulig vagn','Mindre transportvagn.',null,500,'SM','transport',1,'{}','grundregler_1988',600),
('cart_large_2wheel','Transport','Stor tvåhjulig vagn','Större transportvagn.',null,1000,'SM','transport',1,'{}','grundregler_1988',610),
('rowboat','Transport','Roddbåt','Mindre roddbåt.',null,250,'SM','transport',1,'{}','grundregler_1988',620),
('horse_light','Transport','Lätt häst','Lätt ridhäst.',null,300,'SM','transport',1,'{}','grundregler_1988',630),
('horse_medium','Transport','Mellanstor häst','Normalstor häst.',null,500,'SM','transport',1,'{}','grundregler_1988',640),
('horse_heavy','Transport','Tung häst','Stor och kraftig häst.',null,700,'SM','transport',1,'{}','grundregler_1988',650),
('boots','Kläder','Stövlar','Ett par stövlar.',0.5,25,'SM','equipment',1,'{"worn_bep_ignored":true}','grundregler_1988',700),
('cloak','Kläder','Kappa','Vanlig kappa.',1,10,'SM','equipment',1,'{"worn_bep_ignored":true}','grundregler_1988',710),
('shirt','Kläder','Skjorta','Vanlig skjorta.',0.25,25,'KM','equipment',1,'{"worn_bep_ignored":true}','grundregler_1988',720),
('trousers','Kläder','Byxor','Vanliga byxor.',0.5,25,'KM','equipment',1,'{"worn_bep_ignored":true}','grundregler_1988',730),
('stockings','Kläder','Strumpor','Ett par strumpor.',0.25,25,'KM','equipment',1,'{"worn_bep_ignored":true}','grundregler_1988',740),
('jacket','Kläder','Jacka','Vanlig jacka.',0.5,5,'SM','equipment',1,'{"worn_bep_ignored":true}','grundregler_1988',750),
('armor_cloth','Rustning','Tjockt tyg','Standardrustning av tjockt tyg.',2,40,'SM','armor',1,'{"abs":1}','grundregler_1988',800),
('armor_leather','Rustning','Läderrustning','Standardrustning av läder.',3,65,'SM','armor',1,'{"abs":2}','grundregler_1988',810),
('armor_chain','Rustning','Ringbrynja','Standardringbrynja.',5,450,'SM','armor',1,'{"abs":4}','grundregler_1988',820),
('armor_scale','Rustning','Fjällpansar','Standardfjällpansar.',6,900,'SM','armor',1,'{"abs":5}','grundregler_1988',830),
('armor_metalmail','Rustning','Metallbrynja','Tung metallbrynja.',6,1100,'SM','armor',1,'{"abs":6}','grundregler_1988',840),
('armor_halfplate','Rustning','Halvrustning','Halvrustning av metall.',6,1250,'SM','armor',1,'{"abs":7}','grundregler_1988',850),
('armor_fullplate','Rustning','Helrustning','Helrustning av metall.',6,1500,'SM','armor',1,'{"abs":8}','grundregler_1988',860),
('shield_small','Sköld','Liten sköld','Liten sköld.',1,90,'SM','shield',1,'{"abs":8,"strength_group":1}','grundregler_1988',900),
('shield_medium','Sköld','Mellanstor sköld','Mellanstor sköld.',2,165,'SM','shield',1,'{"abs":12,"strength_group":2}','grundregler_1988',910),
('shield_large','Sköld','Stor sköld','Stor sköld.',3,190,'SM','shield',1,'{"abs":16,"strength_group":3}','grundregler_1988',920)
on conflict (item_key) do update set
 category=excluded.category,
 name=excluded.name,
 description=excluded.description,
 bep=excluded.bep,
 price_amount=excluded.price_amount,
 price_currency=excluded.price_currency,
 purchase_kind=excluded.purchase_kind,
 quantity_per_purchase=excluded.quantity_per_purchase,
 metadata=excluded.metadata,
 source_key=excluded.source_key,
 sort_order=excluded.sort_order,
 active=true,
 updated_at=now();
