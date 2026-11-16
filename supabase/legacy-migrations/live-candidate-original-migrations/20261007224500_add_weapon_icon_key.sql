alter table public.rule_weapons
  add column if not exists icon_key text;

update public.rule_weapons
set icon_key = case
  when name = 'Treudd' then 'trident'
  when name = 'Höggaffel' then 'pitchfork'
  when name = 'Kofot' then 'crowbar'
  when name = 'Spade' then 'spade'
  when name = 'Stavslunga' then 'sling'
  when name = 'Blåsrör' then 'blowgun'
  when name = 'Knogjärn' then 'knuckles'
  when name = 'Morgonstjärna' then 'mace'
  when tags @> array['dagger']::text[] then 'dagger'
  when tags @> array['hammer']::text[] then 'hammer'
  when tags @> array['whip']::text[] then 'whip'
  when tags @> array['club']::text[] then 'club'
  when tags @> array['flail']::text[] then 'flail'
  when tags @> array['pick']::text[] then 'pick'
  when tags @> array['staff']::text[] then 'staff'
  when tags @> array['polearm']::text[] then 'halberd'
  when tags @> array['sword']::text[] then 'sword'
  when tags @> array['axe']::text[] then 'axe'
  when tags @> array['spear']::text[] then 'spear'
  when tags @> array['bow']::text[] then 'bow'
  when tags @> array['crossbow']::text[] then 'crossbow'
  when tags @> array['staff_sling']::text[] then 'sling'
  when tags @> array['sling']::text[] then 'sling'
  when tags @> array['star']::text[] then 'shuriken'
  when tags @> array['bola']::text[] then 'bola'
  when tags @> array['lasso']::text[] then 'lasso'
  when tags @> array['unarmed_weapon']::text[] then 'knuckles'
  when tags @> array['tool']::text[] then 'spade'
  else 'generic'
end
where icon_key is null or btrim(icon_key) = '';

alter table public.rule_weapons
  alter column icon_key set default 'generic',
  alter column icon_key set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'rule_weapons_icon_key_nonblank'
      and conrelid = 'public.rule_weapons'::regclass
  ) then
    alter table public.rule_weapons
      add constraint rule_weapons_icon_key_nonblank
      check (btrim(icon_key) <> '');
  end if;
end $$;
