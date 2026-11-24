-- Elongated map art keeps its original dimensions within the existing pixel budget.
alter table public.hermes_alea_jobs
  drop constraint hermes_alea_jobs_width_check,
  drop constraint hermes_alea_jobs_height_check,
  add constraint hermes_alea_jobs_width_check check (
    width between 1 and (case when target_kind='map-object' then 4096 else 2048 end)
  ),
  add constraint hermes_alea_jobs_height_check check (
    height between 1 and (case when target_kind='map-object' then 4096 else 2048 end)
  ),
  add constraint hermes_alea_jobs_pixel_budget check (width::bigint * height <= 4194304);

create or replace function private.hermes_alea_capabilities() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('enabled',enabled and auth.uid() is not null,
    'max_bytes',12000000,'max_dimension',2048,'max_pixels',4194304,'quality',0.92,
    'target_profiles',jsonb_build_object('map-object',jsonb_build_object('max_dimension',4096)))
  from private.hermes_alea_settings where singleton
$$;
