-- Add the first private, alpha-preserving spell-cutout HERMES profile.
-- Existing artwork pointers and access policies stay unchanged.
alter table public.hermes_jobs
  drop constraint if exists hermes_jobs_kind_check;
alter table public.hermes_jobs
  add constraint hermes_jobs_kind_check check (
    kind in ('spell', 'spell-cutout', 'symbol', 'skill', 'skill-illustration',
             'skill-illustration-wide', 'spell-illustration-wide', 'spell-illustration')
  );

-- HERMES is permitted to update only this already-existing independent slot.
grant update (cutout_path) on table public.rule_spells to service_role;
