-- Every weapon master entry must always resolve to a valid skill.

alter table public.rule_weapons
  alter column skill_id set not null;

alter table public.rule_weapons
  drop constraint if exists rule_weapons_skill_id_fkey;

alter table public.rule_weapons
  add constraint rule_weapons_skill_id_fkey
  foreign key (skill_id)
  references public.rule_skills(id)
  on update cascade
  on delete restrict;
