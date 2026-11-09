-- Allow archived weapon originals to use the existing guarded staging-retention cleanup.
-- The original remains in staging until a verified Drive archive is at least seven days old.
create or replace view public.hermes_alea_cleanup_report as
select
  id,
  source_path,
  output_path,
  archive_state,
  archive_drive_id,
  source_sha256,
  output_sha256,
  (target_kind = any (array['definition'::text, 'relief'::text, 'weapon'::text]))
    and archive_state = 'verified'
    and archive_drive_id is not null
    and archive_verified_at <= (now() - interval '7 days')
    and source_deleted_at is null as source_candidate,
  (target_kind = any (array['definition'::text, 'relief'::text]))
    and state = 'activated'
    and archive_state = 'verified'
    and archive_drive_id is not null
    and exists (
      select 1
      from public.hermes_alea_jobs e
      where e.previous_key = ('hermes-alea:'::text || j.id::text)
        and e.detached_at is not null
    )
    and (
      select max(e.detached_at)
      from public.hermes_alea_jobs e
      where e.previous_key = ('hermes-alea:'::text || j.id::text)
    ) <= (now() - interval '30 days')
    and not exists (
      select 1 from public.honor_definitions d
      where d.image_asset_id = ('hermes-alea:'::text || j.id::text)
    )
    and not exists (
      select 1 from public.honor_relief_variants v
      where v.image_asset_id = ('hermes-alea:'::text || j.id::text)
    )
    and output_deleted_at is null as output_candidate,
  state = 'uploading'
    and operation <> 'REMOVE'
    and created_at <= (now() - interval '24 hours')
    and (lease_until is null or lease_until <= now())
    and archive_state = 'not_required'
    and archive_drive_id is null
    and not exists (
      select 1
      from public.hermes_alea_jobs e
      where e.id <> j.id
        and e.previous_key = ('hermes-alea:'::text || j.id::text)
    )
    and not exists (
      select 1 from public.honor_definitions d
      where d.image_asset_id = ('hermes-alea:'::text || j.id::text)
    )
    and not exists (
      select 1 from public.honor_relief_variants v
      where v.image_asset_id = ('hermes-alea:'::text || j.id::text)
    ) as abandoned_candidate
from public.hermes_alea_jobs j;
