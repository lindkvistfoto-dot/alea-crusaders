-- HERMES ALEA: isolated, disabled-by-default Troférum pilot. No existing jobs or buckets changed.
create table private.hermes_alea_settings (
 singleton boolean primary key default true check (singleton),
 enabled boolean not null default false,
 max_pending integer not null default 5 check (max_pending between 1 and 20),
 max_user_bytes bigint not null default 60000000 check (max_user_bytes > 0),
 max_total_bytes bigint not null default 1000000000 check (max_total_bytes > 0)
);
insert into private.hermes_alea_settings(singleton) values(true);
revoke all on private.hermes_alea_settings from public, anon, authenticated;
alter table private.hermes_alea_settings enable row level security;

alter table public.honor_definitions add column image_revision bigint not null default 0;
alter table public.honor_relief_variants add column image_revision bigint not null default 0;

create table public.hermes_alea_jobs (
 id uuid primary key default gen_random_uuid(),
 requested_by uuid not null references auth.users(id),
 idempotency_key uuid not null,
 target_kind text not null check (target_kind in ('definition','relief')),
 target_id uuid not null,
 operation text not null check (operation in ('CREATE','REPLACE','REMOVE')),
 expected_revision bigint not null check (expected_revision >= 0),
 state text not null default 'uploading' check (state in ('uploading','activated','removed','abandoned')),
 previous_key text,
 result_revision bigint,
 source_path text unique,
 output_path text unique,
 source_mime text check (source_mime in ('image/png','image/jpeg','image/webp')),
 source_bytes integer check (source_bytes between 1 and 12000000),
 output_bytes integer check (output_bytes between 1 and 12000000),
 source_sha256 text check (source_sha256 ~ '^[a-f0-9]{64}$'),
 output_sha256 text check (output_sha256 ~ '^[a-f0-9]{64}$'),
 verified_at timestamptz,
 width integer check (width between 1 and 2048),
 height integer check (height between 1 and 2048),
 alpha_preserved boolean,
 archive_state text not null default 'not_required' check (archive_state in ('not_required','queued','processing','retry_wait','verified','needs_attention')),
 archive_drive_id text,
 archive_verified_at timestamptz,
 attempts integer not null default 0,
 next_attempt_at timestamptz,
 lease_token uuid,
 lease_until timestamptz,
 error_code text,
 detached_at timestamptz,
 source_deleted_at timestamptz,
 output_delete_reserved_at timestamptz,
 output_deleted_at timestamptz,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 unique(requested_by,idempotency_key),
 check (operation='REMOVE' or (source_path is not null and output_path is not null and source_mime is not null and source_bytes is not null and output_bytes is not null and source_sha256 is not null and output_sha256 is not null)),
 check (source_path is null or source_path = requested_by::text || '/' || id::text || '/original'),
 check (output_path is null or output_path = 'trophy/' || id::text || '.webp')
);
create index hermes_alea_archive_queue on public.hermes_alea_jobs(archive_state,next_attempt_at);
create index hermes_alea_detach on public.hermes_alea_jobs(previous_key,detached_at);
alter table public.hermes_alea_jobs enable row level security;
revoke all on public.hermes_alea_jobs from public,anon,authenticated;
grant select on public.hermes_alea_jobs to authenticated;
grant all on public.hermes_alea_jobs to service_role;

-- Match existing Honors manager permissions, including the deliberately narrow global GM exception.
create function private.hermes_alea_can_manage(kind text, target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists (
  select 1 from public.honor_definitions d
  where d.id = case when kind='definition' then target when kind='relief' then
    (select honor_id from public.honor_relief_variants where id=target) end
  and d.category in ('medal','award','badge')
  and (private.is_admin() or exists (
   select 1 from public.campaign_members m where m.user_id=auth.uid() and m.role='gm'
    and (m.campaign_id=d.campaign_id or (d.campaign_id is null and lower(d.name) in ('arcane laurel badge','sir robin','sir robin award')))
  ))
 )
$$;
revoke all on function private.hermes_alea_can_manage(text,uuid) from public,anon;
grant execute on function private.hermes_alea_can_manage(text,uuid) to authenticated;
create policy hermes_alea_job_read on public.hermes_alea_jobs for select to authenticated
 using (private.hermes_alea_can_manage(target_kind,target_id));

-- Column trigger protects managed references despite existing table-wide UPDATE grants.
create function private.hermes_alea_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if old.image_asset_id like 'hermes-alea:%' then raise exception 'REMOVE_IMAGE_BEFORE_DELETE'; end if;
  return old;
 end if;
 if coalesce((to_jsonb(new)->'badge_frame_assets')::text,'') like '%hermes-alea:%' then raise exception 'MANAGED_FRAME_REFERENCE_NOT_SUPPORTED'; end if;
 if TG_OP='INSERT' then
  if new.image_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_revision := 0; return new;
 end if;
 if (new.image_asset_id is distinct from old.image_asset_id or new.image_revision is distinct from old.image_revision)
    and (old.image_asset_id like 'hermes-alea:%' or new.image_asset_id like 'hermes-alea:%' or new.image_revision is distinct from old.image_revision)
    and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
 new.image_revision := old.image_revision + case when new.image_asset_id is distinct from old.image_asset_id then 1 else 0 end;
 return new;
end $$;
revoke all on function private.hermes_alea_guard() from public,anon,authenticated;
create trigger hermes_alea_definition_guard before insert or update or delete on public.honor_definitions
 for each row execute function private.hermes_alea_guard();
create trigger hermes_alea_relief_guard before insert or update or delete on public.honor_relief_variants
 for each row execute function private.hermes_alea_guard();

create function private.hermes_alea_capabilities() returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled', enabled and auth.uid() is not null,
 'max_bytes',12000000,'max_dimension',2048,'max_pixels',4194304,'quality',0.92)
 from private.hermes_alea_settings where singleton
$$;
revoke all on function private.hermes_alea_capabilities() from public,anon;
grant execute on function private.hermes_alea_capabilities() to authenticated;
create function public.hermes_alea_capabilities() returns jsonb language sql security invoker set search_path='' as $$
 select private.hermes_alea_capabilities()
$$;
revoke all on function public.hermes_alea_capabilities() from public,anon;
grant execute on function public.hermes_alea_capabilities() to authenticated;

-- Serializes settings/quota allocation; target revision is rechecked when finalizing.
create function private.hermes_alea_begin(request jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.hermes_alea_jobs; s private.hermes_alea_settings; u uuid:=auth.uid();
 kind text:=request->>'target_kind'; target uuid:=(request->>'target_id')::uuid;
 op text:=request->>'operation'; rev bigint:=(request->>'expected_revision')::bigint;
 idem uuid:=(request->>'idempotency_key')::uuid; oldkey text; current_rev bigint;
begin
 if not private.hermes_alea_can_manage(kind,target) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 select * into s from private.hermes_alea_settings where singleton for update;
 if not s.enabled then raise exception 'HERMES_ALEA_DISABLED'; end if;
 select * into j from public.hermes_alea_jobs where requested_by=u and idempotency_key=idem;
 if found then
  if (j.target_kind,j.target_id,j.operation,j.expected_revision) is distinct from (kind,target,op,rev)
   or (op<>'REMOVE' and (j.source_sha256,j.output_sha256,j.source_bytes,j.output_bytes,j.source_mime) is distinct from
    (request->>'source_sha256',request->>'output_sha256',(request->>'source_bytes')::integer,(request->>'output_bytes')::integer,request->>'source_mime'))
   then raise exception 'IDEMPOTENCY_CONFLICT'; end if;
  return to_jsonb(j);
 end if;
 if kind='definition' then select image_asset_id,image_revision into oldkey,current_rev from public.honor_definitions where id=target for update;
 elsif kind='relief' then select image_asset_id,image_revision into oldkey,current_rev from public.honor_relief_variants where id=target for update;
 else raise exception 'BAD_TARGET'; end if;
 if rev is null or current_rev<>rev then raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001'; end if;
 if op not in ('CREATE','REPLACE','REMOVE') or op is null then raise exception 'BAD_OPERATION'; end if;
 if op='CREATE' and oldkey is not null then raise exception 'IMAGE_ALREADY_EXISTS'; end if;
 if op='REPLACE' and oldkey is null then raise exception 'IMAGE_MISSING'; end if;
 if op<>'REMOVE' then
  if (select count(*) from public.hermes_alea_jobs where requested_by=u and state='uploading') >= s.max_pending
    or (select count(*)*12000000 from public.hermes_alea_jobs where requested_by=u and source_path is not null and source_deleted_at is null) + 12000000 > s.max_user_bytes
    or (select count(*)*12000000 from public.hermes_alea_jobs where source_path is not null and source_deleted_at is null) + 12000000 > s.max_total_bytes
   then raise exception 'STAGING_QUOTA_EXCEEDED'; end if;
 end if;
 j.id:=gen_random_uuid();
 insert into public.hermes_alea_jobs(id,requested_by,idempotency_key,target_kind,target_id,operation,expected_revision,previous_key,
 source_path,output_path,source_mime,source_bytes,output_bytes,source_sha256,output_sha256)
 values(j.id,u,idem,kind,target,op,rev,oldkey,
 case when op<>'REMOVE' then u::text||'/'||j.id::text||'/original' end,
 case when op<>'REMOVE' then 'trophy/'||j.id::text||'.webp' end,
 case when op<>'REMOVE' then request->>'source_mime' end,
 case when op<>'REMOVE' then (request->>'source_bytes')::integer end,
 case when op<>'REMOVE' then (request->>'output_bytes')::integer end,
 case when op<>'REMOVE' then request->>'source_sha256' end,
 case when op<>'REMOVE' then request->>'output_sha256' end) returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function private.hermes_alea_begin(jsonb) from public,anon;
grant execute on function private.hermes_alea_begin(jsonb) to authenticated;
create function public.hermes_alea_begin(request jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.hermes_alea_begin(request) $$;
revoke all on function public.hermes_alea_begin(jsonb) from public,anon;
grant execute on function public.hermes_alea_begin(jsonb) to authenticated;

-- Only trusted verification code can write this receipt. Never accept it from browser.
create function public.hermes_alea_verify(job_id uuid, receipt jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_user <> 'service_role' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.hermes_alea_jobs set verified_at=now(),width=(receipt->>'width')::integer,
 height=(receipt->>'height')::integer,alpha_preserved=(receipt->>'alpha_preserved')::boolean
 where id=job_id and state='uploading' and source_sha256=receipt->>'source_sha256' and output_sha256=receipt->>'output_sha256'
 and source_bytes=(receipt->>'source_bytes')::integer and output_bytes=(receipt->>'output_bytes')::integer
 and receipt->>'source_mime'=source_mime;
 if not found then raise exception 'VERIFICATION_CONFLICT'; end if;
end $$;
revoke all on function public.hermes_alea_verify(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.hermes_alea_verify(uuid,jsonb) to service_role;

create function private.hermes_alea_finalize(job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.hermes_alea_jobs; oldkey text; rev bigint; newkey text;
begin
 select * into j from public.hermes_alea_jobs where id=job_id for update;
 if not found or j.requested_by is distinct from auth.uid() or not private.hermes_alea_can_manage(j.target_kind,j.target_id)
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if j.state in ('activated','removed') then return to_jsonb(j); end if;
 if not (select enabled from private.hermes_alea_settings where singleton) then raise exception 'HERMES_ALEA_DISABLED'; end if;
 if j.state<>'uploading' then raise exception 'UPLOAD_NOT_ACTIVE'; end if;
 if j.operation<>'REMOVE' then
  if j.verified_at is null then raise exception 'UPLOAD_NOT_VERIFIED'; end if;
  if not exists(select 1 from storage.objects where bucket_id='hermes-alea-originals' and name=j.source_path)
    or not exists(select 1 from storage.objects where bucket_id='hermes-alea-display' and name=j.output_path)
   then raise exception 'UPLOAD_INCOMPLETE'; end if;
  newkey:='hermes-alea:'||j.id::text;
 end if;
 if j.target_kind='definition' then select image_asset_id,image_revision into oldkey,rev from public.honor_definitions where id=j.target_id for update;
 else select image_asset_id,image_revision into oldkey,rev from public.honor_relief_variants where id=j.target_id for update; end if;
 if not found or rev<>j.expected_revision or oldkey is distinct from j.previous_key then raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001'; end if;
 if j.target_kind='definition' then update public.honor_definitions set image_asset_id=newkey,updated_at=now() where id=j.target_id returning image_revision into rev;
 else update public.honor_relief_variants set image_asset_id=newkey,updated_at=now() where id=j.target_id returning image_revision into rev; end if;
 update public.hermes_alea_jobs set state=case when j.operation='REMOVE' then 'removed' else 'activated' end,
 result_revision=rev,completed_at=now(),detached_at=case when oldkey is not null then now() end,
 archive_state=case when j.operation='REMOVE' then 'not_required' else 'queued' end where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
revoke all on function private.hermes_alea_finalize(uuid) from public,anon;
grant execute on function private.hermes_alea_finalize(uuid) to authenticated;
create function public.hermes_alea_finalize(job_id uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.hermes_alea_finalize(job_id) $$;
revoke all on function public.hermes_alea_finalize(uuid) from public,anon;
grant execute on function public.hermes_alea_finalize(uuid) to authenticated;

-- REMOVE creates its event and detaches atomically, with the same idempotency/CAS contract.
create function public.hermes_alea_remove(request jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j jsonb;
begin
 if request->>'operation' is distinct from 'REMOVE' then raise exception 'BAD_OPERATION'; end if;
 j:=private.hermes_alea_begin(request);
 return private.hermes_alea_finalize((j->>'id')::uuid);
end $$;
revoke all on function public.hermes_alea_remove(jsonb) from public,anon;
grant execute on function public.hermes_alea_remove(jsonb) to authenticated;

-- Metadata-only projection. No archive IDs, original paths or user IDs in renderer payloads.
create view public.hermes_alea_assets with (security_invoker=true) as
 select 'hermes-alea:'||id::text as asset_key,output_path as asset_path,width,height,alpha_preserved,
 'published'::text as publication_status from public.hermes_alea_jobs
 where state='activated' and output_deleted_at is null and output_delete_reserved_at is null;
grant select on public.hermes_alea_assets to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('hermes-alea-originals','hermes-alea-originals',false,12000000,array['image/png','image/jpeg','image/webp']),
 ('hermes-alea-display','hermes-alea-display',false,12000000,array['image/webp']);

create function private.hermes_alea_storage_allowed(bucket text,path text,reading boolean) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.hermes_alea_jobs j where
 private.hermes_alea_can_manage(j.target_kind,j.target_id) and
 ((bucket='hermes-alea-originals' and path=j.source_path and j.requested_by=auth.uid())
  or (bucket='hermes-alea-display' and path=j.output_path)) and
 case when reading then j.output_delete_reserved_at is null and j.output_deleted_at is null
 else j.requested_by=auth.uid() and j.state='uploading' and j.verified_at is null
  and j.created_at>now()-interval '24 hours' and (select enabled from private.hermes_alea_settings where singleton) end)
$$;
revoke all on function private.hermes_alea_storage_allowed(text,text,boolean) from public,anon;
grant execute on function private.hermes_alea_storage_allowed(text,text,boolean) to authenticated;
create policy hermes_alea_insert on storage.objects for insert to authenticated
 with check(private.hermes_alea_storage_allowed(bucket_id,name,false));
create policy hermes_alea_read on storage.objects for select to authenticated
 using(private.hermes_alea_storage_allowed(bucket_id,name,true));
-- No client UPDATE/DELETE policies. Existing unrelated policies must also be restrictive by bucket.

-- Lease fencing: a stale attempt cannot acknowledge or retry another attempt.
create function public.hermes_alea_claim(batch_size integer default 3) returns setof public.hermes_alea_jobs
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 return query update public.hermes_alea_jobs j set archive_state='processing',attempts=attempts+1,
 lease_token=gen_random_uuid(),lease_until=now()+interval '15 minutes'
 where j.id in (select q.id from public.hermes_alea_jobs q
 where q.state='activated' and q.attempts<10 and
 ((q.archive_state in ('queued','retry_wait') and (q.next_attempt_at is null or q.next_attempt_at<=now()))
  or (q.archive_state='processing' and q.lease_until<now()))
 order by q.created_at for update skip locked limit least(greatest(batch_size,1),10)) returning j.*;
 update public.hermes_alea_jobs set archive_state='needs_attention',error_code='LEASE_RETRY_EXHAUSTED',lease_token=null,lease_until=null
 where archive_state='processing' and lease_until<now() and attempts>=10;
end $$;
revoke all on function public.hermes_alea_claim(integer) from public,anon,authenticated;
grant execute on function public.hermes_alea_claim(integer) to service_role;

create function public.hermes_alea_archive_result(job_id uuid, token uuid, drive_id text default null, failure text default null) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 update public.hermes_alea_jobs set archive_state=case when drive_id is not null and failure is null then 'verified' when attempts>=10 then 'needs_attention' else 'retry_wait' end,
 archive_drive_id=coalesce(drive_id,archive_drive_id),archive_verified_at=case when drive_id is not null and failure is null then now() else archive_verified_at end,
 error_code=left(failure,160),next_attempt_at=now()+make_interval(secs=>case attempts when 1 then 300 when 2 then 1800 when 3 then 7200 when 4 then 21600 else 86400 end),
 lease_token=null,lease_until=null
 where id=job_id and lease_token=token and lease_until>now() and archive_state='processing'
 and (drive_id is null or archive_drive_id=drive_id);
 if not found then raise exception 'STALE_LEASE'; end if;
end $$;
revoke all on function public.hermes_alea_archive_result(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.hermes_alea_archive_result(uuid,uuid,text,text) to service_role;

-- Report-only cleanup: never authorizes physical deletion in V1 before separate approval.
create view public.hermes_alea_cleanup_report with (security_invoker=true) as
 select j.id,j.source_path,j.output_path,j.archive_state,j.archive_drive_id,j.source_sha256,j.output_sha256,
 (j.archive_state='verified' and j.archive_drive_id is not null and j.archive_verified_at<=now()-interval '7 days' and j.source_deleted_at is null) as source_candidate,
 (j.state='activated' and j.archive_state='verified' and j.archive_drive_id is not null
 and exists(select 1 from public.hermes_alea_jobs e where e.previous_key='hermes-alea:'||j.id::text and e.detached_at is not null)
 and (select max(e.detached_at) from public.hermes_alea_jobs e where e.previous_key='hermes-alea:'||j.id::text)<=now()-interval '30 days'
 and not exists(select 1 from public.honor_definitions d where d.image_asset_id='hermes-alea:'||j.id::text)
 and not exists(select 1 from public.honor_relief_variants v where v.image_asset_id='hermes-alea:'||j.id::text)
 and j.output_deleted_at is null) as output_candidate,
 (j.state='uploading' and j.created_at<=now()-interval '24 hours') as abandoned_candidate
 from public.hermes_alea_jobs j;
revoke all on public.hermes_alea_cleanup_report from public,anon,authenticated;
grant select on public.hermes_alea_cleanup_report to service_role;
grant usage on schema private to authenticated;
