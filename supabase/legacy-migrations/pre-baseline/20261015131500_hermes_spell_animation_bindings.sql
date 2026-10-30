-- HERMES: shared visual animation cues for ranged magic.
insert into public.combat_animation_cues(event_key,label,category,speed,blend_mode) values
 ('magic.projectile','Magi · projektil','magic',1,'normal'),
 ('magic.impact','Magi · träffeffekt','magic',1,'normal')
on conflict(event_key) do nothing;
alter table public.rule_spells
 add column if not exists projectile_animation_key text references public.combat_animation_cues(event_key) on update cascade on delete set null,
 add column if not exists impact_animation_key text references public.combat_animation_cues(event_key) on update cascade on delete set null;
comment on column public.rule_spells.projectile_animation_key is 'Optional HERMES cue for travelling projectile; only visual.';
comment on column public.rule_spells.impact_animation_key is 'Optional HERMES cue for impact effect; only visual.';
