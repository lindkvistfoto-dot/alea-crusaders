-- Report the same reservation semantics used by hermes_alea_begin.
create or replace function public.hermes_alea_health() returns jsonb
language plpgsql set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 select jsonb_build_object('pending',count(*) filter(where archive_state in ('queued','processing','retry_wait')),
 'needs_attention',count(*) filter(where archive_state='needs_attention'),
 'oldest_pending',min(created_at) filter(where archive_state in ('queued','processing','retry_wait')),
 'last_verified_archive',max(archive_verified_at),
 'reserved_staging_bytes',coalesce(sum(case when state='activated' then source_bytes else 12000000 end)
   filter(where source_path is not null and source_deleted_at is null),0)) into result
 from public.hermes_alea_jobs;
 return result;
end $$;
