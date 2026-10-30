-- HERMES 2.1 skill icons: preserve existing manual-upload paths and illustration slots.
-- Public HERMES paths are content-addressed, and skill target keys are hyphenated rule_skills ids.

alter table public.hermes_jobs drop constraint if exists hermes_jobs_kind_check;
alter table public.hermes_jobs add constraint hermes_jobs_kind_check
 check (kind in ('spell', 'symbol', 'skill'));

alter table public.rule_skills drop constraint if exists rule_skills_icon_path_scoped;
alter table public.rule_skills add constraint rule_skills_icon_path_scoped check (
 icon_path is null or
 (
  icon_path ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/icon/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp)$'
  and split_part(icon_path, '/', 2) = id
 ) or (
  icon_path ~ '^hermes/skill/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{64}[.]webp$'
  and split_part(icon_path, '/', 3) = replace(id, '_', '-')
 )
);

comment on column public.rule_skills.icon_path is 'Skill icon: private alea-skill-art manual-upload image OR verified HERMES content-addressed public WebP.';
