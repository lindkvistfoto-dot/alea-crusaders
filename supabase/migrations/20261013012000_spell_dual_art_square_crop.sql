-- Alea Crusaders: independent square icon and spell-effect artwork.
-- Historical image_path remains for backwards compatibility. Existing images
-- are linked into both slots, so replacing either slot never erases the other.
alter table public.rule_spells
  add column if not exists icon_path text,
  add column if not exists effect_image_path text,
  add column if not exists icon_focus_x integer not null default 50,
  add column if not exists icon_focus_y integer not null default 50,
  add column if not exists icon_zoom integer not null default 120,
  add column if not exists effect_focus_x integer not null default 50,
  add column if not exists effect_focus_y integer not null default 50,
  add column if not exists effect_zoom integer not null default 120;

update public.rule_spells
set icon_path = coalesce(icon_path, image_path),
    effect_image_path = coalesce(effect_image_path, image_path),
    icon_focus_x = coalesce(image_focus_x, 50),
    icon_focus_y = coalesce(image_focus_y, 50),
    effect_focus_x = coalesce(image_focus_x, 50),
    effect_focus_y = coalesce(image_focus_y, 50)
where image_path is not null
  and (icon_path is null or effect_image_path is null);

alter table public.rule_spells
  drop constraint if exists rule_spells_dual_art_paths;
alter table public.rule_spells
  add constraint rule_spells_dual_art_paths check (
    (icon_path is null or (
      icon_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and split_part(icon_path,'/',2)=id::text
    )) and
    (effect_image_path is null or (
      effect_image_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and split_part(effect_image_path,'/',2)=id::text
    ))
  );

alter table public.rule_spells
  drop constraint if exists rule_spells_dual_art_crop_bounds;
alter table public.rule_spells
  add constraint rule_spells_dual_art_crop_bounds check (
    icon_focus_x between 0 and 100 and icon_focus_y between 0 and 100
    and effect_focus_x between 0 and 100 and effect_focus_y between 0 and 100
    and icon_zoom between 100 and 300 and effect_zoom between 100 and 300
  );

comment on column public.rule_spells.icon_path is
  'Square-cropped spell selector icon, private immutable WebP at spell/<spell uuid>/<image uuid>.webp.';
comment on column public.rule_spells.effect_image_path is
  'Square-cropped spell effect artwork, privately stored; combat action snapshots preserve this file path.';
comment on column public.rule_spells.icon_zoom is 'Icon crop zoom in percent, 100..300.';
comment on column public.rule_spells.effect_zoom is 'Effect art crop zoom in percent, 100..300.';
