-- Keep the full reservation for every unfinished upload. Finalize already checks
-- source_bytes against immutable Storage metadata before state becomes activated.
-- Release only the unused part of that reservation; preserve all existing limits,
-- source retention, per-job checks and target adapters. No file is deleted.
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
 if kind in ('combatant-pose','race-pose') and (op not in ('CREATE','REPLACE') or request->>'source_mime' not in ('image/png','image/webp')) then raise exception 'BAD_POSE_OPERATION'; end if;
 select image_key,revision into oldkey,current_rev from private.hermes_alea_target_lock(kind,target);
 if not found then raise exception 'BAD_TARGET'; end if;
 if rev is null or current_rev<>rev then raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001'; end if;
 if op not in ('CREATE','REPLACE','REMOVE') or op is null then raise exception 'BAD_OPERATION'; end if;
 if op='CREATE' and oldkey is not null then raise exception 'IMAGE_ALREADY_EXISTS'; end if;
 if op='REPLACE' and oldkey is null then raise exception 'IMAGE_MISSING'; end if;
 if op<>'REMOVE' then
  if (select count(*) from public.hermes_alea_jobs where requested_by=u and state='uploading') >= s.max_pending
    or (select coalesce(sum(case when state='activated' then source_bytes else 12000000 end),0) from public.hermes_alea_jobs where requested_by=u and source_path is not null and source_deleted_at is null) + 12000000 > s.max_user_bytes
    or (select coalesce(sum(case when state='activated' then source_bytes else 12000000 end),0) from public.hermes_alea_jobs where source_path is not null and source_deleted_at is null) + 12000000 > s.max_total_bytes
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
 if kind='combatant-pose' then
  update public.combatant_battle_poses p set pending_staging_path=j.source_path
  where p.id=target and p.pending_staging_path is null and p.publication_status in ('draft','published')
   and (p.publication_status='published' or p.staging_path is null)
   and not exists(select 1 from public.hermes_web_jobs w where w.pose_id=p.id and w.state not in ('published','failed'));
  if not found then raise exception 'POSE_BUSY'; end if;
 elsif kind='race-pose' then
  update public.race_battle_poses p set pending_staging_path=j.source_path
  where p.id=target and p.pending_staging_path is null and p.publication_status in ('draft','published')
   and (p.publication_status='published' or p.staging_path is null)
   and not exists(select 1 from public.hermes_web_jobs w where w.race_pose_id=p.id and w.state not in ('published','failed'));
  if not found then raise exception 'POSE_BUSY'; end if;
 end if;
 return to_jsonb(j);
end $$;
