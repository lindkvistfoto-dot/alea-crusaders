-- HERMES ALEA direct storage activation: no WASM or Edge verifier in upload path.
-- Storage-owned metadata, target ownership, revision, and both private objects remain mandatory.
-- Hashes remain recorded for later archive integrity checks, not claimed verified here.
create or replace function private.hermes_alea_finalize(job_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare j public.hermes_alea_jobs; oldkey text; rev bigint; newkey text;
 source_meta jsonb; output_meta jsonb;
begin
 select * into j from public.hermes_alea_jobs where id=job_id for update;
 if not found or j.requested_by is distinct from auth.uid() or not private.hermes_alea_can_manage(j.target_kind,j.target_id)
 then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 if j.state in ('activated','removed') then return to_jsonb(j); end if;
 if not (select enabled from private.hermes_alea_settings where singleton) then raise exception 'HERMES_ALEA_DISABLED'; end if;
 if j.state<>'uploading' then raise exception 'UPLOAD_NOT_ACTIVE'; end if;
 if j.operation<>'REMOVE' then
  select metadata into source_meta from storage.objects where bucket_id='hermes-alea-originals' and name=j.source_path;
  select metadata into output_meta from storage.objects where bucket_id='hermes-alea-display' and name=j.output_path;
  if source_meta is null or output_meta is null then raise exception 'UPLOAD_INCOMPLETE'; end if;
  if j.source_bytes < 1 or j.source_bytes > 12000000 or j.output_bytes < 1 or j.output_bytes > 12000000
     or coalesce((source_meta->>'size')::bigint,-1) <> j.source_bytes
     or coalesce((output_meta->>'size')::bigint,-1) <> j.output_bytes
     or source_meta->>'mimetype' is distinct from j.source_mime
     or output_meta->>'mimetype' is distinct from 'image/webp'
  then raise exception 'UPLOAD_METADATA_MISMATCH'; end if;
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
