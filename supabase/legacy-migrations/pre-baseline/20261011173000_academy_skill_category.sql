-- Expert's A/B grouping is independent from the existing skill family
-- (STR, LÄR, TJU, etc.) and the per-FV cost. Default A for existing data:
-- do not guess B classifications from cost or name.
alter table public.rule_skills
 add column if not exists expert_category text not null default 'A'
 check (expert_category in ('A','B'));
comment on column public.rule_skills.expert_category is
 'Drakar och Demoner Expert advancement category A or B. Admin-set, defaults to A.';
