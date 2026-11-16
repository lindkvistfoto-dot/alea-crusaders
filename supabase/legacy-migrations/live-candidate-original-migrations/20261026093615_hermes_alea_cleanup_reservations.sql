-- Separate destructive gate. Remains false until explicitly approved after report-mode pilot.
alter table private.hermes_alea_settings add column cleanup_enabled boolean not null default false;
alter table public.hermes_alea_jobs add column source_delete_reserved_at timestamptz;

create function public.hermes_alea_inventory(page_offset integer default 0) returns table(bucket text,path text,job_id uuid)
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 return query select o.bucket_id,o.name,j.id from storage.objects o
 left join public.hermes_alea_jobs j on
 (o.bucket_id='hermes-alea-originals' and o.name=j.source_path) or (o.bucket_id='hermes-alea-display' and o.name=j.output_path)
 where o.bucket_id in ('hermes-alea-originals','hermes-alea-display')
 order by o.bucket_id,o.name limit 500 offset greatest(page_offset,0);
end $$;
revoke all on function public.hermes_alea_inventory(integer) from public,anon,authenticated;
grant execute on function public.hermes_alea_inventory(integer) to service_role;

-- Re-linking a reserved output must use the same row lock as cleanup.
create function private.hermes_alea_link_guard() returns trigger language plpgsql set search_path='' as $$
declare j public.hermes_alea_jobs;
begin
 if new.image_asset_id is distinct from old.image_asset_id and new.image_asset_id like 'hermes-alea:%' then
  select * into j from public.hermes_alea_jobs where 'hermes-alea:'||id::text=new.image_asset_id for update;
  if not found or j.output_delete_reserved_at is not null or j.output_deleted_at is not null then raise exception 'IMAGE_RESERVED_OR_MISSING'; end if;
 end if;
 return new;
end $$;
revoke all on function private.hermes_alea_link_guard() from public,anon,authenticated;
create trigger hermes_alea_definition_link_guard before update on public.honor_definitions
 for each row execute function private.hermes_alea_link_guard();
create trigger hermes_alea_relief_link_guard before update on public.honor_relief_variants
 for each row execute function private.hermes_alea_link_guard();

create function public.hermes_alea_cleanup(job_id uuid,kind text,action text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.hermes_alea_jobs; eligible boolean;
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 if not (select cleanup_enabled from private.hermes_alea_settings where singleton) then raise exception 'CLEANUP_NOT_APPROVED'; end if;
 if kind not in ('source','output') or action not in ('reserve','ack') then raise exception 'BAD_CLEANUP_ACTION'; end if;
 select * into j from public.hermes_alea_jobs where id=job_id for update;
 if not found then raise exception 'JOB_NOT_FOUND'; end if;
 if (kind='source' and j.source_deleted_at is not null) or (kind='output' and j.output_deleted_at is not null) then return to_jsonb(j); end if;
 select case when kind='source' then source_candidate else output_candidate end into eligible
 from public.hermes_alea_cleanup_report where id=j.id;
 if not coalesce(eligible,false) then raise exception 'CLEANUP_BLOCKED'; end if;
 if action='reserve' then
  update public.hermes_alea_jobs set
   source_delete_reserved_at=case when kind='source' then coalesce(source_delete_reserved_at,now()) else source_delete_reserved_at end,
   output_delete_reserved_at=case when kind='output' then coalesce(output_delete_reserved_at,now()) else output_delete_reserved_at end
  where id=j.id returning * into j;
 else
  if (kind='source' and j.source_delete_reserved_at is null) or (kind='output' and j.output_delete_reserved_at is null) then raise exception 'RESERVATION_MISSING'; end if;
  update public.hermes_alea_jobs set source_deleted_at=case when kind='source' then now() else source_deleted_at end,
   output_deleted_at=case when kind='output' then now() else output_deleted_at end where id=j.id returning * into j;
 end if;
 return to_jsonb(j);
end $$;
revoke all on function public.hermes_alea_cleanup(uuid,text,text) from public,anon,authenticated;
grant execute on function public.hermes_alea_cleanup(uuid,text,text) to service_role;
-- The invoker needs private settings access; never grant this to browser roles.
grant usage on schema private to service_role;
grant select on private.hermes_alea_settings to service_role;
create policy hermes_alea_settings_service_read on private.hermes_alea_settings for select to service_role using(true);

-- Persist a pre-generated Drive file ID before upload; create retries then use exactly that ID.
create function public.hermes_alea_archive_intent(job_id uuid,token uuid,drive_id text) returns text
language plpgsql security invoker set search_path='' as $$
declare chosen text;
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 if drive_id is null or drive_id !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'INVALID_DRIVE_ID'; end if;
 update public.hermes_alea_jobs set archive_drive_id=coalesce(archive_drive_id,drive_id)
 where id=job_id and lease_token=token and lease_until>now() and archive_state='processing'
 returning archive_drive_id into chosen;
 if not found then raise exception 'STALE_LEASE'; end if;
 return chosen;
end $$;
revoke all on function public.hermes_alea_archive_intent(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.hermes_alea_archive_intent(uuid,uuid,text) to service_role;

create view public.hermes_alea_detach_events with (security_invoker=true) as
 select e.id,e.target_kind,e.target_id,e.previous_key,e.detached_at,
 case e.operation when 'REPLACE' then 'ERSATT' when 'REMOVE' then 'BORTTAGEN' end as reason,
 case when old.output_path is not null then 'hermes-alea-display' end as previous_bucket,
 old.output_path as previous_path,old.archive_state,old.output_deleted_at
 from public.hermes_alea_jobs e left join public.hermes_alea_jobs old on e.previous_key='hermes-alea:'||old.id::text
 where e.detached_at is not null and e.state in ('activated','removed');
grant select on public.hermes_alea_detach_events to authenticated;

create function public.hermes_alea_health() returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 select jsonb_build_object('pending',count(*) filter(where archive_state in ('queued','processing','retry_wait')),
 'needs_attention',count(*) filter(where archive_state='needs_attention'),
 'oldest_pending',min(created_at) filter(where archive_state in ('queued','processing','retry_wait')),
 'last_verified_archive',max(archive_verified_at),
 'reserved_staging_bytes',12000000*count(*) filter(where source_path is not null and source_deleted_at is null)) into result
 from public.hermes_alea_jobs;
 return result;
end $$;
revoke all on function public.hermes_alea_health() from public,anon,authenticated;
grant execute on function public.hermes_alea_health() to service_role;
