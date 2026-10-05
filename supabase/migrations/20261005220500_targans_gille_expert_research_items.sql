-- Targans Gille step 3: allow researched-but-not-yet-priced Expert items.
-- Exact Expert prices are intentionally not guessed. Unpriced rows remain visible but not purchasable.
alter table public.rule_shop_items
  alter column price_amount drop not null;

insert into public.rule_shop_items
(item_key,category,name,description,bep,price_amount,price_currency,purchase_kind,quantity_per_purchase,metadata,source_key,sort_order,active)
values
('expert_vinkelhake','Verktyg','Vinkelhake','Mätverktyg för räta vinklar. Förekomsten och att varan har ett pris är verifierad i Drakar och Demoner Expert; exakt Expert-pris återstår att verifiera.',null,null,'SM','equipment',1,
 '{"expert_presence_verified":true,"expert_price_verified":false,"research_status":"price_pending","reference":"https://www.rollspel.nu/threads/jag-g%C3%B6r-ocks%C3%A5-31-rollpersoner-p%C3%A5-31-dagar.76238/page-3"}'::jsonb,
 'expert_1985_verified_name',9001,true),
('expert_porslinsbagare','Köksutrustning','Porslinsbägare','Bägare av porslin. Förekomsten och att varan har ett pris är verifierad i Drakar och Demoner Expert; exakt Expert-pris återstår att verifiera.',null,null,'SM','equipment',1,
 '{"expert_presence_verified":true,"expert_price_verified":false,"research_status":"price_pending","reference":"https://www.rollspel.nu/threads/jag-g%C3%B6r-ocks%C3%A5-31-rollpersoner-p%C3%A5-31-dagar.76238/page-3"}'::jsonb,
 'expert_1985_verified_name',9002,true),
('expert_halm','Äventyr','Halm','Halm som fysisk handelsvara. Förekomsten och att varan har ett pris är verifierad i Drakar och Demoner Expert; exakt Expert-pris och mängdangivelse återstår att verifiera.',null,null,'SM','equipment',1,
 '{"expert_presence_verified":true,"expert_price_verified":false,"research_status":"price_pending","reference":"https://www.rollspel.nu/threads/jag-g%C3%B6r-ocks%C3%A5-31-rollpersoner-p%C3%A5-31-dagar.76238/page-3"}'::jsonb,
 'expert_1985_verified_name',9003,true),
('expert_snoskor','Äventyr','Snöskor','Snöskor för färd i djup snö. Förekomsten och att varan har ett pris är verifierad i Drakar och Demoner Expert; exakt Expert-pris återstår att verifiera.',null,null,'SM','equipment',1,
 '{"expert_presence_verified":true,"expert_price_verified":false,"research_status":"price_pending","reference":"https://www.rollspel.nu/threads/jag-g%C3%B6r-ocks%C3%A5-31-rollpersoner-p%C3%A5-31-dagar.76238/page-3"}'::jsonb,
 'expert_1985_verified_name',9004,true)
on conflict (item_key) do nothing;
