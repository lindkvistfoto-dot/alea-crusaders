-- Extend existing ALEA targets. No new queue, RLS policy, grant, secret or publisher.
alter table public.hermes_alea_jobs drop constraint hermes_alea_jobs_target_kind_check;
alter table public.hermes_alea_jobs add constraint hermes_alea_jobs_target_kind_check
 check(target_kind in ('definition','relief','combatant-pose','race-pose'));
alter table public.combatant_battle_poses add column image_revision bigint not null default 0;
alter table public.race_battle_poses add column image_revision bigint not null default 0;
create or replace function private.hermes_alea_pose_revision() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then new.image_revision:=0;
 else
  new.image_revision:=old.image_revision+case when
   (to_jsonb(new)-array['image_revision','updated_at','pending_staging_path','source_sha256'])
    is distinct from (to_jsonb(old)-array['image_revision','updated_at','pending_staging_path','source_sha256']) then 1 else 0 end;
 end if;
 return new;
end $$;
create trigger hermes_alea_pose_revision before insert or update on public.combatant_battle_poses
 for each row execute function private.hermes_alea_pose_revision();
create trigger hermes_alea_pose_revision before insert or update on public.race_battle_poses
 for each row execute function private.hermes_alea_pose_revision();


CREATE OR REPLACE FUNCTION "private"."hermes_alea_can_manage"("kind" "text", "target" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select auth.uid() is not null and ((kind='combatant-pose' and private.is_admin() and exists(select 1 from public.combatant_battle_poses where id=target))
 or (kind='race-pose' and private.is_admin() and exists(select 1 from public.race_battle_poses where id=target))
 or (kind in ('definition','relief') and exists (
  select 1 from public.honor_definitions d
  where d.id = case when kind='definition' then target when kind='relief' then
    (select honor_id from public.honor_relief_variants where id=target) end
  and d.category in ('medal','award','badge')
  and (private.is_admin() or exists (
   select 1 from public.campaign_members m where m.user_id=auth.uid() and m.role='gm'
    and (m.campaign_id=d.campaign_id or (d.campaign_id is null and lower(d.name) in ('arcane laurel badge','sir robin','sir robin award')))
  ))
 )))
$$;

create or replace function private.hermes_alea_target_lock(kind text,target uuid)
returns table(image_key text,revision bigint)
language plpgsql set search_path='' as $$
begin
 if kind='definition' then
  return query select d.image_asset_id,d.image_revision from public.honor_definitions d where d.id=target for update;
 elsif kind='relief' then
  return query select v.image_asset_id,v.image_revision from public.honor_relief_variants v where v.id=target for update;
 elsif kind='combatant-pose' then
  return query select p.image_path,p.image_revision from public.combatant_battle_poses p where p.id=target for update;
 elsif kind='race-pose' then
  return query select p.image_path,p.image_revision from public.race_battle_poses p where p.id=target for update;
 else raise exception 'BAD_TARGET';
 end if;
end $$;

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
 elsif kind='combatant-pose' then
  update public.combatant_battle_poses set image_path=newkey where id=target returning image_revision into rev;
 elsif kind='race-pose' then
  update public.race_battle_poses set image_path=newkey where id=target returning image_revision into rev;
 else raise exception 'BAD_TARGET';
 end if;
 if not found then raise exception 'BAD_TARGET'; end if;
 return rev;
end $$;

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
  if j.target_kind in ('combatant-pose','race-pose') then
   if j.verified_at is null or j.alpha_preserved is distinct from true or j.width>1280 or j.height>1280 then raise exception 'UPLOAD_NOT_VERIFIED'; end if;
   newkey:='hermes/'||case when j.target_kind='race-pose' then 'race-battle-pose-cutout' else 'battle-pose-cutout' end||'/'||j.target_id::text||'/'||j.output_sha256||'.webp';
   if not exists(select 1 from storage.objects where bucket_id='alea-hermes-public' and name=newkey
      and (metadata->>'size')::bigint=j.output_bytes and metadata->>'mimetype'='image/webp') then raise exception 'POSE_OUTPUT_MISSING'; end if;
  else newkey:='hermes-alea:'||j.id::text;
  end if;
 end if;
 select image_key,revision into oldkey,rev from private.hermes_alea_target_lock(j.target_kind,j.target_id);
 if not found or rev<>j.expected_revision or oldkey is distinct from j.previous_key then raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001'; end if;
 if j.target_kind='combatant-pose' then
  if not exists(select 1 from public.combatant_battle_poses where id=j.target_id and pending_staging_path=j.source_path) then raise exception 'POSE_RESERVATION_CHANGED'; end if;
 elsif j.target_kind='race-pose' then
  if not exists(select 1 from public.race_battle_poses where id=j.target_id and pending_staging_path=j.source_path) then raise exception 'POSE_RESERVATION_CHANGED'; end if;
 end if;
 rev:=private.hermes_alea_target_set(j.target_kind,j.target_id,newkey);
 if j.target_kind='combatant-pose' then
  update public.combatant_battle_poses set pending_staging_path=null,source_sha256=j.source_sha256 where id=j.target_id;
 elsif j.target_kind='race-pose' then
  update public.race_battle_poses set pending_staging_path=null,source_sha256=j.source_sha256 where id=j.target_id;
 end if;
 update public.hermes_alea_jobs set state=case when j.operation='REMOVE' then 'removed' else 'activated' end,
 result_revision=rev,completed_at=now(),detached_at=case when oldkey is not null then now() end,
 archive_state=case when j.operation='REMOVE' then 'not_required' else 'queued' end where id=j.id returning * into j;
 return to_jsonb(j);
end $$;

CREATE OR REPLACE VIEW "public"."hermes_alea_cleanup_report" WITH ("security_invoker"='true') AS
 SELECT "id",
    "source_path",
    "output_path",
    "archive_state",
    "archive_drive_id",
    "source_sha256",
    "output_sha256",
    (("target_kind" IN ('definition','relief')) AND ("archive_state" = 'verified'::"text") AND ("archive_drive_id" IS NOT NULL) AND ("archive_verified_at" <= ("now"() - '7 days'::interval)) AND ("source_deleted_at" IS NULL)) AS "source_candidate",
    (("target_kind" IN ('definition','relief')) AND ("state" = 'activated'::"text") AND ("archive_state" = 'verified'::"text") AND ("archive_drive_id" IS NOT NULL) AND (EXISTS ( SELECT 1
           FROM "public"."hermes_alea_jobs" "e"
          WHERE (("e"."previous_key" = ('hermes-alea:'::"text" || ("j"."id")::"text")) AND ("e"."detached_at" IS NOT NULL)))) AND (( SELECT "max"("e"."detached_at") AS "max"
           FROM "public"."hermes_alea_jobs" "e"
          WHERE ("e"."previous_key" = ('hermes-alea:'::"text" || ("j"."id")::"text"))) <= ("now"() - '30 days'::interval)) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."honor_definitions" "d"
          WHERE ("d"."image_asset_id" = ('hermes-alea:'::"text" || ("j"."id")::"text"))))) AND (NOT (EXISTS ( SELECT 1
           FROM "public"."honor_relief_variants" "v"
          WHERE ("v"."image_asset_id" = ('hermes-alea:'::"text" || ("j"."id")::"text"))))) AND ("output_deleted_at" IS NULL)) AS "output_candidate",
    (("state" = 'uploading'::"text") AND ("created_at" <= ("now"() - '24:00:00'::interval))) AS "abandoned_candidate"
   FROM "public"."hermes_alea_jobs" "j";
