-- Normalize the Laurel frame family identifier after the original registry migration.
update public.honor_definitions
set frame_family = 'arcane_laurel_badge'
where name = 'ARCANE LAUREL BADGE' and frame_family = 'arcane-laurel-badge';
