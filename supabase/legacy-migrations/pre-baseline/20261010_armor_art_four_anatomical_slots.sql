-- Alea Crusaders · ordinarie stridssystem · fyra rustningsbilder per typ
-- Applied to production Supabase 2026-10-10.
alter table public.rule_armor_types add column if not exists image_head_path text;
alter table public.rule_armor_types add column if not exists image_arms_path text;
alter table public.rule_armor_types add column if not exists image_torso_path text;
alter table public.rule_armor_types add column if not exists image_legs_path text;
comment on column public.rule_armor_types.image_head_path is 'Image asset for head armor slot.';
comment on column public.rule_armor_types.image_arms_path is 'Image asset for arm armor slot.';
comment on column public.rule_armor_types.image_torso_path is 'Image asset for torso armor slot.';
comment on column public.rule_armor_types.image_legs_path is 'Image asset for leg armor slot.';

-- Keep the previous path format for weapons, shields and legacy armor artwork.
-- New armor paths include the body zone.
drop policy if exists equipment_art_insert_admin on storage.objects;
create policy equipment_art_insert_admin on storage.objects
for insert to authenticated
with check (
 bucket_id='alea-equipment-art'
 and (select private.is_admin())
 and (
  name ~ '^(weapon|armor|shield)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
  or name ~ '^armor/(head|arms|torso|legs)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'
 )
);
