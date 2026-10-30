-- ELD (F) uses existing uploaded magic projectile and impact cues.
update public.rule_spells set projectile_animation_key='magic.projectile',
 impact_animation_key='magic.impact', updated_at=now()
where spell_key='eld' and exists(
 select 1 from public.combat_animation_cues p join public.combat_animation_cues i on i.event_key='magic.impact'
 where p.event_key='magic.projectile' and p.asset_path is not null and i.asset_path is not null
);
