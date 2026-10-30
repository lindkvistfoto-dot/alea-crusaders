-- General target boundary for HERMES ALEA. Only registered, explicitly reviewed
-- adapters may resolve/update image pointers. No arbitrary table or column names.
create or replace function private.hermes_alea_target_lock(kind text,target uuid)
returns table(image_key text,revision bigint)
language plpgsql set search_path='' as $$
begin
 if kind='definition' then
  return query select d.image_asset_id,d.image_revision from public.honor_definitions d where d.id=target for update;
 elsif kind='relief' then
  return query select v.image_asset_id,v.image_revision from public.honor_relief_variants v where v.id=target for update;
 else raise exception 'BAD_TARGET';
 end if;
end $$;
revoke all on function private.hermes_alea_target_lock(text,uuid) from public,anon,authenticated;

create or replace function private.hermes_alea_target_set(kind text,target uuid,newkey text)
returns bigint language plpgsql set search_path='' as $$
declare rev bigint;
begin
 if kind='definition' then
  update public.honor_definitions set image_asset_id=newkey,updated_at=now()
  where id=target returning image_revision into rev;
 elsif kind='relief' then
  update public.honor_relief_variants set image_asset_id=newkey,updated_at=now()
  where id=target returning image_revision into rev;
 else raise exception 'BAD_TARGET';
 end if;
 if not found then raise exception 'BAD_TARGET'; end if;
 return rev;
end $$;
revoke all on function private.hermes_alea_target_set(text,uuid,text) from public,anon,authenticated;

create or replace function private.hermes_alea_begin(request jsonb) returns jsonb
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
 select image_key,revision into oldkey,current_rev from private.hermes_alea_target_lock(kind,target);
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

create or replace function private.hermes_alea_finalize(job_id uuid) returns jsonb
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
 select image_key,revision into oldkey,rev from private.hermes_alea_target_lock(j.target_kind,j.target_id);
 if not found or rev<>j.expected_revision or oldkey is distinct from j.previous_key then raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001'; end if;
 rev:=private.hermes_alea_target_set(j.target_kind,j.target_id,newkey);
 update public.hermes_alea_jobs set state=case when j.operation='REMOVE' then 'removed' else 'activated' end,
 result_revision=rev,completed_at=now(),detached_at=case when oldkey is not null then now() end,
 archive_state=case when j.operation='REMOVE' then 'not_required' else 'queued' end where id=j.id returning * into j;
 return to_jsonb(j);
end $$;
