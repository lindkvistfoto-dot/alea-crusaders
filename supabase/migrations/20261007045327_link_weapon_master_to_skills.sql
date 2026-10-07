-- Link every weapon master entry to the STR skill that supplies its FV.
-- Existing skills are preserved; missing weapon-group skills are added once.

insert into public.rule_skills (id,name,type,base_attribute,cost,bc,description)
values
 ('klubbor_hammare','Klubbor & hammare','STR','SMI',2,'SMI','Färdighet med klubbor, hammare, morgonstjärnor och närbesläktade slagvapen.'),
 ('slagor_gissel','Slagor & gissel','STR','SMI',2,'SMI','Färdighet med slagor, gissel och närbesläktade ledade slagvapen.'),
 ('stangvapen','Stångvapen','STR','SMI',2,'SMI','Färdighet med hillebarder, pikar och andra tyngre stångvapen.'),
 ('kastvapen','Kastvapen','STR','SMI',2,'SMI','Färdighet med kastvapen som inte hör till en annan etablerad vapengrupp.'),
 ('lasso','Lasso','STR','SMI',2,'SMI','Färdighet att använda lasso i strid.'),
 ('piskor','Piskor','STR','SMI',2,'SMI','Färdighet med piskor.'),
 ('bola','Bola','STR','SMI',2,'SMI','Färdighet att använda bola.'),
 ('blasror','Blåsrör','STR','SMI',2,'SMI','Färdighet att använda blåsrör.')
on conflict (id) do nothing;

alter table public.rule_weapons
  add column if not exists skill_id text
  references public.rule_skills(id)
  on update cascade
  on delete set null;

create index if not exists rule_weapons_skill_id_idx
  on public.rule_weapons(skill_id);

update public.rule_weapons
set skill_id = case
  when name='Bola' then 'bola'
  when name='Lasso' then 'lasso'
  when 'whip'=any(tags) then 'piskor'
  when 'blowgun'=any(tags) then 'blasror'
  when 'crossbow'=any(tags) then 'armborst'
  when 'bow'=any(tags) then 'pilbagar'
  when 'sling'=any(tags) or 'staff_sling'=any(tags) then 'slungor'
  when 'unarmed_weapon'=any(tags) then 'slagsmal'
  when 'polearm'=any(tags) then 'stangvapen'
  when 'flail'=any(tags) then 'slagor_gissel'
  when 'staff'=any(tags) then 'stavar'
  when 'spear'=any(tags) then 'spjut'
  when 'axe'=any(tags) then 'yxor'
  when 'dagger'=any(tags) then 'dolkar'
  when 'sword'=any(tags) and handling='1H' then 'enhandssvard'
  when 'sword'=any(tags) then 'ovriga_svard'
  when 'hammer'=any(tags) or 'club'=any(tags) or 'morningstar'=any(tags) or 'pick'=any(tags) or 'tool'=any(tags) then 'klubbor_hammare'
  when 'star'=any(tags) then 'kastvapen'
  else skill_id
end,
updated_at=now();
