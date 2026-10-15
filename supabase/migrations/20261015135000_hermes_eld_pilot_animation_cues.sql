-- Dedicated HERMES effects for ELD (F). Media uploaded separately through Animationsadmin.
insert into public.combat_animation_cues(event_key,label,category,speed,blend_mode) values
 ('magic.eld.projectile','Eld · projektil','magic',1,'screen'),
 ('magic.eld.impact','Eld · träffeffekt','magic',1,'screen')
on conflict(event_key) do nothing;
update public.rule_spells
set projectile_animation_key='magic.eld.projectile',
    impact_animation_key='magic.eld.impact',
    updated_at=now()
where spell_key='eld';
