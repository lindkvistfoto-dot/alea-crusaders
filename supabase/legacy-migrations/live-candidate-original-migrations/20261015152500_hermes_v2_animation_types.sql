alter table public.combat_animation_cues add column if not exists animation_type text;
update public.combat_animation_cues set animation_type=case
 when event_key like '%.projectile' or event_key='ranged.attack' then 'projectile'
 when event_key like '%.impact' or event_key like '%.hit' or event_key like '%.miss' or event_key like '%.parry' or event_key like '%.fumble' then 'effect'
 when event_key like 'melee.%' then 'attack'
 when category='system' then 'system'
 else 'other' end where animation_type is null;
alter table public.combat_animation_cues alter column animation_type set default 'other';
alter table public.combat_animation_cues alter column animation_type set not null;
alter table public.combat_animation_cues add constraint hermes_animation_type_valid check(animation_type in ('projectile','effect','attack','area','system','other'));
