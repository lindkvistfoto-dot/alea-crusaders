-- Badge frames are selected per image variant from the shared transparent frame library.
-- Remove the former automatic bronze/silver/gold Lion frame mapping while preserving all frame assets.
update public.honor_definitions
set badge_frame_assets = coalesce(badge_frame_assets, '{}'::jsonb) - 'bronze' - 'silver' - 'gold',
    frame_family = null,
    updated_at = now()
where category = 'badge'
  and (
    coalesce(badge_frame_assets, '{}'::jsonb) ?| array['bronze','silver','gold']
    or frame_family = 'arcane_lion_badge'
  );
