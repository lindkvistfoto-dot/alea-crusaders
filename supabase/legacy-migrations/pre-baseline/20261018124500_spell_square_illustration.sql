-- ALEA CRUSADERS · BESVÄRJELSE ILLUSTRATION (1:1)
-- Fifth independent spell art slot. No backfill from icon/effect/cutout/WIDE.
-- The existing private alea-spell-art bucket already permits immutable UUID WebP files.
alter table public.rule_spells
  add column if not exists illustration_path text;

alter table public.rule_spells
  drop constraint if exists rule_spells_illustration_path_scoped;
alter table public.rule_spells
  add constraint rule_spells_illustration_path_scoped check (
    illustration_path is null or (
      illustration_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'
      and split_part(illustration_path, '/', 2) = id::text
    )
  );

comment on column public.rule_spells.illustration_path is
  'BESVÄRJELSE ILLUSTRATION: opaque square 1:1 full-frame image in private alea-spell-art, distinct from ARCANE IVORY icon, effect, cutout and WIDE. Unlinking does not delete immutable assets.';

-- Trusted HERMES 2.1 service role may activate this one independent column.
grant update (illustration_path) on table public.rule_spells to service_role;

alter table public.hermes_jobs
  drop constraint if exists hermes_jobs_kind_check;
alter table public.hermes_jobs
  add constraint hermes_jobs_kind_check check (
    kind in ('spell', 'symbol', 'skill', 'skill-illustration',
             'skill-illustration-wide', 'spell-illustration-wide', 'spell-illustration')
  );
