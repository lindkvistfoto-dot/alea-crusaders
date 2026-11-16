-- Alea Crusaders v0.35.190: optional transparent cutout for spell center frame.
-- This third artwork layer is independent of icon, effect and historical image_path.
-- Do not backfill a square image into a cutout.
alter table public.rule_spells
 add column if not exists cutout_path text,
 add column if not exists cutout_x integer not null default 50,
 add column if not exists cutout_y integer not null default 90,
 add column if not exists cutout_scale integer not null default 160;

alter table public.rule_spells
 drop constraint if exists rule_spells_cutout_path_scoped;
alter table public.rule_spells
 add constraint rule_spells_cutout_path_scoped check (
  cutout_path is null or (
   cutout_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
   and split_part(cutout_path,'/',2)=id::text
  )
 );

alter table public.rule_spells
 drop constraint if exists rule_spells_cutout_position_bounds;
alter table public.rule_spells
 add constraint rule_spells_cutout_position_bounds check (
  cutout_x between 0 and 100 and cutout_y between 0 and 100
  and cutout_scale between 50 and 250
 );

comment on column public.rule_spells.cutout_path is
 'Optional transparent WebP cutout shown above combat center gold frame; not inherited from other spell images.';
comment on column public.rule_spells.cutout_x is 'Horizontal cutout anchor, percent of frame width.';
comment on column public.rule_spells.cutout_y is 'Cutout image baseline, percent of frame height.';
comment on column public.rule_spells.cutout_scale is 'Cutout proportion-preserving size, 50..250 percent.';
