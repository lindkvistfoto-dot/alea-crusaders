-- Alea Crusaders: one projectile master link per ranged or thrown weapon.
-- Reuse weapon artwork for thrown projectiles at the UI level; do not copy image assets.
insert into public.rule_projectile_types(projectile_key,name,description,recovery_percent,sort_order)
values ('lasso','Lasson','Kastad fångstlina (bild hämtas från vapnet Lasso)',90,100)
on conflict(projectile_key) do nothing;

-- Repair all canonical ranged/throwing weapon links while preserving unrelated entries.
update public.rule_weapons
set projectile_key=case
 when category='projectile' and 'bow'=any(tags) then 'arrow'
 when category='projectile' and 'crossbow'=any(tags) then 'bolt'
 when category='projectile' and ('sling'=any(tags) or 'staff_sling'=any(tags)) then 'stone'
 when category='projectile' and 'blowgun'=any(tags) then 'dart'
 when category='thrown' and name='Kastyxa' then 'throwing_axe'
 when category='thrown' and name='Kastspjut' then 'javelin'
 when category='thrown' and name='Kastkniv' then 'throwing_knife'
 when category='thrown' and name='Kaststjärna' then 'throwing_star'
 when category='thrown' and name='Bola' then 'bola'
 when category='thrown' and name='Lasso' then 'lasso'
 else projectile_key end
where category in ('projectile','thrown');

-- Never allow an unlinked projectile or throwing weapon to become usable in combat.
-- New ranged types can use any master projectile, but must choose an existing one.
do $$
begin
 if not exists (
  select 1 from pg_constraint
  where conrelid='public.rule_weapons'::regclass
    and conname='rule_weapons_ranged_ammo_required'
 ) then
  alter table public.rule_weapons
   add constraint rule_weapons_ranged_ammo_required
   check (category not in ('projectile','thrown') or projectile_key is not null);
 end if;
end $$;
