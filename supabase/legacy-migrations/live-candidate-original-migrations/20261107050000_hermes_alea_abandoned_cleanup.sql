-- Align LIVE HERMES ALEA stale-upload cleanup with the guarded DEV implementation.
-- The report excludes active image references and requires an expired lease.
create or replace view public.hermes_alea_cleanup_report as
select
  j.id,
  j.source_path,
  j.output_path,
  j.archive_state,
  j.archive_drive_id,
  j.source_sha256,
  j.output_sha256,
  (j.target_kind = any (array['definition'::text, 'relief'::text]))
    and j.archive_state = 'verified'
    and j.archive_drive_id is not null
    and j.archive_verified_at <= (now() - interval '7 days')
    and j.source_deleted_at is null as source_candidate,
  (j.target_kind = any (array['definition'::text, 'relief'::text]))
    and j.state = 'activated'
    and j.archive_state = 'verified'
    and j.archive_drive_id is not null
    and exists (
      select 1 from public.hermes_alea_jobs e
      where e.previous_key = 'hermes-alea:' || j.id::text
        and e.detached_at is not null
    )
    and (
      select max(e.detached_at) from public.hermes_alea_jobs e
      where e.previous_key = 'hermes-alea:' || j.id::text
    ) <= (now() - interval '30 days')
    and not exists (
      select 1 from public.honor_definitions d
      where d.image_asset_id = 'hermes-alea:' || j.id::text
    )
    and not exists (
      select 1 from public.honor_relief_variants v
      where v.image_asset_id = 'hermes-alea:' || j.id::text
    )
    and j.output_deleted_at is null as output_candidate,
  (j.target_kind = any (array['definition'::text, 'relief'::text]))
    and j.state = 'uploading'
    and j.operation <> 'REMOVE'
    and j.created_at <= (now() - interval '24 hours')
    and (j.lease_until is null or j.lease_until <= now())
    and j.archive_state = 'not_required'
    and j.archive_drive_id is null
    and not exists (
      select 1 from public.hermes_alea_jobs e
      where e.id <> j.id
        and e.previous_key = 'hermes-alea:' || j.id::text
    )
    and not exists (
      select 1 from public.honor_definitions d
      where d.image_asset_id = 'hermes-alea:' || j.id::text
    )
    and not exists (
      select 1 from public.honor_relief_variants v
      where v.image_asset_id = 'hermes-alea:' || j.id::text
    ) as abandoned_candidate
from public.hermes_alea_jobs j;

create or replace function public.hermes_alea_cleanup(job_id uuid, kind text, action text)
returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  j public.hermes_alea_jobs;
  eligible boolean;
  abandoned boolean;
begin
  if current_user <> 'service_role' then
    raise exception 'FORBIDDEN';
  end if;
  if kind not in ('source', 'output', 'abandoned') or action not in ('reserve', 'ack') then
    raise exception 'BAD_CLEANUP_ACTION';
  end if;

  select * into j from public.hermes_alea_jobs where id = job_id for update;
  if not found then
    raise exception 'JOB_NOT_FOUND';
  end if;
  if (kind = 'source' and j.source_deleted_at is not null)
    or (kind = 'output' and j.output_deleted_at is not null)
    or (kind = 'abandoned' and j.state = 'abandoned'
      and j.source_deleted_at is not null and j.output_deleted_at is not null)
  then
    return to_jsonb(j);
  end if;

  select coalesce(r.abandoned_candidate, false),
    case
      when kind = 'source' then coalesce(r.source_candidate, false) or coalesce(r.abandoned_candidate, false)
      when kind = 'output' then coalesce(r.output_candidate, false) or coalesce(r.abandoned_candidate, false)
      else coalesce(r.abandoned_candidate, false)
    end
  into abandoned, eligible
  from public.hermes_alea_cleanup_report r
  where r.id = j.id;
  if not coalesce(eligible, false) then
    raise exception 'CLEANUP_BLOCKED';
  end if;
  if kind <> 'abandoned'
    and not (select cleanup_enabled from private.hermes_alea_settings where singleton)
  then
    raise exception 'CLEANUP_NOT_APPROVED';
  end if;

  if action = 'reserve' then
    update public.hermes_alea_jobs set
      source_delete_reserved_at = case
        when kind in ('source', 'abandoned') then coalesce(source_delete_reserved_at, now())
        else source_delete_reserved_at end,
      output_delete_reserved_at = case
        when kind in ('output', 'abandoned') then coalesce(output_delete_reserved_at, now())
        else output_delete_reserved_at end
    where id = j.id returning * into j;
  else
    if (kind in ('source', 'abandoned') and j.source_delete_reserved_at is null)
      or (kind in ('output', 'abandoned') and j.output_delete_reserved_at is null)
    then
      raise exception 'RESERVATION_MISSING';
    end if;
    update public.hermes_alea_jobs set
      source_deleted_at = case when kind in ('source', 'abandoned') then now() else source_deleted_at end,
      output_deleted_at = case when kind in ('output', 'abandoned') then now() else output_deleted_at end
    where id = j.id returning * into j;

    if kind = 'abandoned' and abandoned
      and j.source_deleted_at is not null and j.output_deleted_at is not null
    then
      update public.hermes_alea_jobs set
        state = 'abandoned',
        error_code = coalesce(error_code, 'STAGING_EXPIRED'),
        completed_at = coalesce(completed_at, now())
      where id = j.id returning * into j;

      if j.target_kind = 'combatant-pose' then
        update public.combatant_battle_poses set pending_staging_path = null
        where id = j.target_id and pending_staging_path = j.source_path;
      elsif j.target_kind = 'race-pose' then
        update public.race_battle_poses set pending_staging_path = null
        where id = j.target_id and pending_staging_path = j.source_path;
      end if;
    end if;
  end if;
  return to_jsonb(j);
end
$function$;
