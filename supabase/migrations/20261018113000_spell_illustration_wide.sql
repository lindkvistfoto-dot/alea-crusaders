-- ALEA CRUSADERS · BESVÄRJELSE ILLUSTRATION WIDE
-- Fourth independent spell artwork slot; the other three images remain unchanged.
-- Reuse the existing private alea-spell-art bucket and its immutable UUID WebP path policy.
-- Removal only unlinks the slot, preserving the image for audit and history.
alter table public.rule_spells
  add column if not exists illustration_wide_path text;

alter table public.rule_spells
  drop constraint if exists rule_spells_illustration_wide_path_scoped;

alter table public.rule_spells
  add constraint rule_spells_illustration_wide_path_scoped check (
    illustration_wide_path is null or (
      illustration_wide_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
      and split_part(illustration_wide_path,'/',2)=id::text
    )
  );

comment on column public.rule_spells.illustration_wide_path is
  'BESVÄRJELSE ILLUSTRATION WIDE: original aspect ratio landscape illustration; private immutable WebP in alea-spell-art, independent from icon/effect/cutout.';

-- HERMES 2.1 publisher can update only this column for trusted publication.
grant update (illustration_wide_path) on table public.rule_spells to service_role;

-- Enable HERMES 2.1 orchestration for the new optional image type.
alter table public.hermes_jobs
  drop constraint if exists hermes_jobs_kind_check;
alter table public.hermes_jobs
  add constraint hermes_jobs_kind_check check (
    kind in ('spell','symbol','skill','skill-illustration','skill-illustration-wide','spell-illustration-wide')
  );
