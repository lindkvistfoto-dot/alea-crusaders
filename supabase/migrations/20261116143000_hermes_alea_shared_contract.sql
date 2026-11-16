-- Converge HERMES ALEA's shared database contract to the DEV implementation.
-- The Olympia staging-alert RPC and Olympia tables are intentionally excluded.
-- No job rows, image pointers, Storage objects, or environment settings are copied.

alter table public.hermes_alea_jobs
  drop constraint if exists hermes_alea_jobs_target_kind_check;
alter table public.hermes_alea_jobs
  add constraint hermes_alea_jobs_target_kind_check
  check (target_kind in ('definition','relief','weapon','armor_head','armor_arms','armor_torso','armor_legs'));

create or replace function private.hermes_alea_armor_active(kind text,target uuid,key text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.rule_armor_types a where a.id=target and case kind
   when 'armor_head' then a.image_head_asset_id=key
   when 'armor_arms' then a.image_arms_asset_id=key
   when 'armor_torso' then a.image_torso_asset_id=key
   when 'armor_legs' then a.image_legs_asset_id=key
   else false end
 )
$$;

create or replace function private.hermes_alea_armor_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.image_head_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_head_revision:=0;
 else
  if (new.image_head_asset_id is distinct from old.image_head_asset_id or new.image_head_revision is distinct from old.image_head_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_head_revision:=old.image_head_revision+case when new.image_head_asset_id is distinct from old.image_head_asset_id
   or new.image_head_revision is distinct from old.image_head_revision then 1 else 0 end;
 end if;
 if TG_OP='INSERT' then
  if new.image_arms_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_arms_revision:=0;
 else
  if (new.image_arms_asset_id is distinct from old.image_arms_asset_id or new.image_arms_revision is distinct from old.image_arms_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_arms_revision:=old.image_arms_revision+case when new.image_arms_asset_id is distinct from old.image_arms_asset_id
   or new.image_arms_revision is distinct from old.image_arms_revision then 1 else 0 end;
 end if;
 if TG_OP='INSERT' then
  if new.image_torso_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_torso_revision:=0;
 else
  if (new.image_torso_asset_id is distinct from old.image_torso_asset_id or new.image_torso_revision is distinct from old.image_torso_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_torso_revision:=old.image_torso_revision+case when new.image_torso_asset_id is distinct from old.image_torso_asset_id
   or new.image_torso_revision is distinct from old.image_torso_revision then 1 else 0 end;
 end if;
 if TG_OP='INSERT' then
  if new.image_legs_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_legs_revision:=0;
 else
  if (new.image_legs_asset_id is distinct from old.image_legs_asset_id or new.image_legs_revision is distinct from old.image_legs_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_legs_revision:=old.image_legs_revision+case when new.image_legs_asset_id is distinct from old.image_legs_asset_id
   or new.image_legs_revision is distinct from old.image_legs_revision then 1 else 0 end;
 end if;
 return new;
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

create or replace function private.hermes_alea_can_manage(kind text, target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
   (kind='weapon' and private.is_admin() and exists(
     select 1 from public.rule_weapons w where w.id=target
   ))
   or (kind in ('armor_head','armor_arms','armor_torso','armor_legs') and private.is_admin() and exists(
     select 1 from public.rule_armor_types a where a.id=target
   ))
   or (kind in ('definition','relief') and exists (
     select 1 from public.honor_definitions d
     where d.id = case when kind='definition' then target when kind='relief' then
       (select honor_id from public.honor_relief_variants where id=target) end
     and d.category in ('medal','award','badge')
     and (private.is_admin() or exists (
       select 1 from public.campaign_members m where m.user_id=auth.uid() and m.role='gm'
        and (m.campaign_id=d.campaign_id or (d.campaign_id is null and lower(d.name) in ('arcane laurel badge','sir robin','sir robin award')))
     ))
   ))
 )
$$;

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

create or replace function private.hermes_alea_require_verified_activation()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.state='activated' and new.operation<>'REMOVE' and new.verified_at is null then
  raise exception 'UPLOAD_NOT_VERIFIED';
 end if;
 return new;
end $$;

create or replace function private.hermes_alea_storage_allowed(bucket text, path text, reading boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hermes_alea_jobs j
    where (
      private.hermes_alea_can_manage(j.target_kind, j.target_id)
      or (
        bucket = 'hermes-alea-display'
        and (j.target_kind = 'weapon' or private.hermes_alea_armor_active(j.target_kind,j.target_id,'hermes-alea:' || j.id::text))
        and j.state = 'activated'
        and (private.hermes_alea_armor_active(j.target_kind,j.target_id,'hermes-alea:' || j.id::text) or exists (
          select 1
          from public.rule_weapons w
          where w.id = j.target_id
            and w.image_asset_id = 'hermes-alea:' || j.id::text
        ))
      )
    )
    and (
      (bucket = 'hermes-alea-originals' and path = j.source_path and j.requested_by = auth.uid())
      or (bucket = 'hermes-alea-display' and path = j.output_path)
    )
    and case
      when reading then
        j.output_delete_reserved_at is null
        and j.output_deleted_at is null
        and (
          bucket <> 'hermes-alea-display'
          or j.state = 'activated'
          or private.hermes_alea_can_manage(j.target_kind, j.target_id)
        )
      else
        private.hermes_alea_can_manage(j.target_kind, j.target_id)
        and j.requested_by = auth.uid()
        and j.state = 'uploading'
        and j.verified_at is null
        and j.created_at > now() - interval '24 hours'
        and (select enabled from private.hermes_alea_settings where singleton)
    end
  );
$$;

create or replace function private.hermes_alea_target_lock(kind text,target uuid)
returns table(image_key text,revision bigint)
language plpgsql set search_path='' as $$
begin
 if kind='definition' then
  return query select d.image_asset_id,d.image_revision from public.honor_definitions d where d.id=target for update;
 elsif kind='relief' then
  return query select v.image_asset_id,v.image_revision from public.honor_relief_variants v where v.id=target for update;
 elsif kind='weapon' then
  return query select w.image_asset_id,w.image_revision from public.rule_weapons w where w.id=target for update;
 elsif kind='armor_head' then
  return query select a.image_head_asset_id,a.image_head_revision from public.rule_armor_types a where a.id=target for update;
 elsif kind='armor_arms' then
  return query select a.image_arms_asset_id,a.image_arms_revision from public.rule_armor_types a where a.id=target for update;
 elsif kind='armor_torso' then
  return query select a.image_torso_asset_id,a.image_torso_revision from public.rule_armor_types a where a.id=target for update;
 elsif kind='armor_legs' then
  return query select a.image_legs_asset_id,a.image_legs_revision from public.rule_armor_types a where a.id=target for update;
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
 elsif kind='weapon' then
  update public.rule_weapons set image_asset_id=newkey,updated_at=now()
  where id=target returning image_revision into rev;
 elsif kind='armor_head' then
  update public.rule_armor_types set image_head_asset_id=newkey,image_head_revision=image_head_revision+1,updated_at=now()
  where id=target returning image_head_revision into rev;
 elsif kind='armor_arms' then
  update public.rule_armor_types set image_arms_asset_id=newkey,image_arms_revision=image_arms_revision+1,updated_at=now()
  where id=target returning image_arms_revision into rev;
 elsif kind='armor_torso' then
  update public.rule_armor_types set image_torso_asset_id=newkey,image_torso_revision=image_torso_revision+1,updated_at=now()
  where id=target returning image_torso_revision into rev;
 elsif kind='armor_legs' then
  update public.rule_armor_types set image_legs_asset_id=newkey,image_legs_revision=image_legs_revision+1,updated_at=now()
  where id=target returning image_legs_revision into rev;
 else raise exception 'BAD_TARGET';
 end if;
 if not found then raise exception 'BAD_TARGET'; end if;
 return rev;
end $$;

create or replace function private.hermes_alea_weapon_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.image_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_revision:=0; return new;
 end if;
 if (new.image_asset_id is distinct from old.image_asset_id or new.image_revision is distinct from old.image_revision)
   and (old.image_asset_id like 'hermes-alea:%' or new.image_asset_id like 'hermes-alea:%'
     or new.image_revision is distinct from old.image_revision)
   and current_user in ('anon','authenticated') then
  raise exception 'USE_HERMES_ALEA';
 end if;
 new.image_revision:=old.image_revision + case when new.image_asset_id is distinct from old.image_asset_id then 1 else 0 end;
 return new;
end $$;

create or replace function public.hermes_alea_cleanup(job_id uuid, kind text, action text)
returns jsonb language plpgsql set search_path='' as $$
declare
 j public.hermes_alea_jobs;
 eligible boolean;
 abandoned boolean;
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 if kind not in ('source','output','abandoned') or action not in ('reserve','ack') then raise exception 'BAD_CLEANUP_ACTION'; end if;
 select * into j from public.hermes_alea_jobs where id=job_id for update;
 if not found then raise exception 'JOB_NOT_FOUND'; end if;
 if (kind='source' and j.source_deleted_at is not null)
   or (kind='output' and j.output_deleted_at is not null)
   or (kind='abandoned' and j.state='abandoned' and j.source_deleted_at is not null and j.output_deleted_at is not null)
 then return to_jsonb(j); end if;
 select coalesce(r.abandoned_candidate,false),
  case when kind='source' then coalesce(r.source_candidate,false) or coalesce(r.abandoned_candidate,false)
       when kind='output' then coalesce(r.output_candidate,false) or coalesce(r.abandoned_candidate,false)
       else coalesce(r.abandoned_candidate,false) end
 into abandoned,eligible
 from public.hermes_alea_cleanup_report r where r.id=j.id;
 if not coalesce(eligible,false) then raise exception 'CLEANUP_BLOCKED'; end if;
 if kind<>'abandoned' and not (select cleanup_enabled from private.hermes_alea_settings where singleton)
 then raise exception 'CLEANUP_NOT_APPROVED'; end if;
 if action='reserve' then
  update public.hermes_alea_jobs set
   source_delete_reserved_at=case when kind in ('source','abandoned') then coalesce(source_delete_reserved_at,now()) else source_delete_reserved_at end,
   output_delete_reserved_at=case when kind in ('output','abandoned') then coalesce(output_delete_reserved_at,now()) else output_delete_reserved_at end
  where id=j.id returning * into j;
 else
  if (kind in ('source','abandoned') and j.source_delete_reserved_at is null)
    or (kind in ('output','abandoned') and j.output_delete_reserved_at is null)
  then raise exception 'RESERVATION_MISSING'; end if;
  update public.hermes_alea_jobs set
   source_deleted_at=case when kind in ('source','abandoned') then now() else source_deleted_at end,
   output_deleted_at=case when kind in ('output','abandoned') then now() else output_deleted_at end
  where id=j.id returning * into j;
  if kind='abandoned' and abandoned and j.source_deleted_at is not null and j.output_deleted_at is not null then
   update public.hermes_alea_jobs set state='abandoned',error_code=coalesce(error_code,'STAGING_EXPIRED'),completed_at=coalesce(completed_at,now())
    where id=j.id returning * into j;
   if j.target_kind='combatant-pose' then
    update public.combatant_battle_poses set pending_staging_path=null where id=j.target_id and pending_staging_path=j.source_path;
   elsif j.target_kind='race-pose' then
    update public.race_battle_poses set pending_staging_path=null where id=j.target_id and pending_staging_path=j.source_path;
   end if;
  end if;
 end if;
 return to_jsonb(j);
end $$;

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

-- Keep the public asset projection behind its defined authenticated-only grants.
alter view public.hermes_alea_assets set (security_invoker = false, security_barrier = true);
create or replace view public.hermes_alea_assets as
select
  'hermes-alea:' || j.id::text as asset_key,
  j.output_path as asset_path,
  j.width,
  j.height,
  j.alpha_preserved,
  'published'::text as publication_status
from public.hermes_alea_jobs j
where j.state = 'activated'
  and j.output_deleted_at is null
  and j.output_delete_reserved_at is null
  and (
    (
      j.target_kind = 'weapon'
      and exists (
        select 1
        from public.rule_weapons w
        where w.id = j.target_id
          and w.image_asset_id = 'hermes-alea:' || j.id::text
      )
    )
    or private.hermes_alea_armor_active(j.target_kind,j.target_id,'hermes-alea:' || j.id::text)
    or private.hermes_alea_can_manage(j.target_kind, j.target_id)
  );

alter view public.hermes_alea_cleanup_report set (security_invoker = true);
create or replace view public.hermes_alea_cleanup_report as
select
  id,
  source_path,
  output_path,
  archive_state,
  archive_drive_id,
  source_sha256,
  output_sha256,
  (target_kind = any (array['definition'::text, 'relief'::text, 'weapon'::text,'armor_head'::text,'armor_arms'::text,'armor_torso'::text,'armor_legs'::text]))
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

-- Rebuild only HERMES ALEA triggers; their functions enforce revision, pointer,
-- and verified-activation invariants without rewriting existing image rows.
drop trigger if exists hermes_alea_pose_revision on public.combatant_battle_poses;
create trigger hermes_alea_pose_revision before insert or update on public.combatant_battle_poses
  for each row execute function private.hermes_alea_pose_revision();
drop trigger if exists hermes_alea_pose_revision on public.race_battle_poses;
create trigger hermes_alea_pose_revision before insert or update on public.race_battle_poses
  for each row execute function private.hermes_alea_pose_revision();
drop trigger if exists hermes_alea_weapon_guard on public.rule_weapons;
create trigger hermes_alea_weapon_guard before insert or update on public.rule_weapons
  for each row execute function private.hermes_alea_weapon_guard();
drop trigger if exists hermes_alea_armor_guard on public.rule_armor_types;
create trigger hermes_alea_armor_guard before insert or update on public.rule_armor_types
  for each row execute function private.hermes_alea_armor_guard();
drop trigger if exists hermes_alea_require_verified_activation on public.hermes_alea_jobs;
create trigger hermes_alea_require_verified_activation before update of state on public.hermes_alea_jobs
  for each row execute function private.hermes_alea_require_verified_activation();


-- Preserve the existing RLS policies. Normalize table grants to the verified
-- LIVE least-privilege model and keep HERMES worker writes in service_role.
revoke all privileges on table public.hermes_alea_jobs from public, anon, authenticated, service_role;
grant select on public.hermes_alea_jobs to authenticated;
grant select, insert, update, delete on public.hermes_alea_jobs to service_role;
revoke all privileges on table public.hermes_jobs from public, anon, authenticated, service_role;
grant select on public.hermes_jobs to authenticated;
grant select, insert, update on public.hermes_jobs to service_role;
revoke all privileges on table public.hermes_web_jobs from public, anon, authenticated, service_role;
grant select, insert on public.hermes_web_jobs to authenticated;
grant select, update on public.hermes_web_jobs to service_role;

-- Public wrappers expose user actions only to signed-in users. Worker and cleanup
-- endpoints are service_role-only. DEV-only Olympia reporting remains separate.
revoke all on function public.hermes_alea_archive_intent(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_archive_intent(uuid,uuid,text) to service_role;
revoke all on function public.hermes_alea_archive_result(uuid,uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_archive_result(uuid,uuid,text,text) to service_role;
revoke all on function public.hermes_alea_begin(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_begin(jsonb) to authenticated;
revoke all on function public.hermes_alea_capabilities() from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_capabilities() to authenticated;
revoke all on function public.hermes_alea_claim(integer) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_claim(integer) to service_role;
revoke all on function public.hermes_alea_cleanup(uuid,text,text) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_cleanup(uuid,text,text) to service_role;
revoke all on function public.hermes_alea_finalize(uuid) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_finalize(uuid) to authenticated;
revoke all on function public.hermes_alea_health() from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_health() to service_role;
revoke all on function public.hermes_alea_inventory(integer) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_inventory(integer) to service_role;
revoke all on function public.hermes_alea_remove(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_remove(jsonb) to authenticated;
revoke all on function public.hermes_alea_verify(uuid,jsonb) from public, anon, authenticated, service_role;
grant execute on function public.hermes_alea_verify(uuid,jsonb) to service_role;

revoke all on function private.hermes_alea_pose_revision() from public, anon, authenticated, service_role;
revoke all on function private.hermes_alea_weapon_guard() from public, anon, authenticated, service_role;
revoke all on function private.hermes_alea_armor_guard() from public, anon, authenticated, service_role;
revoke all on function private.hermes_alea_require_verified_activation() from public, anon, authenticated, service_role;
revoke all on function private.hermes_alea_armor_active(text,uuid,text) from public, anon, authenticated, service_role;
grant execute on function private.hermes_alea_armor_active(text,uuid,text) to authenticated;
revoke all on function private.hermes_alea_storage_allowed(text,text,boolean) from public, anon, authenticated, service_role;
grant execute on function private.hermes_alea_storage_allowed(text,text,boolean) to authenticated;

revoke all on public.hermes_alea_assets from public, anon, authenticated, service_role;
grant select on public.hermes_alea_assets to authenticated;
revoke all on public.hermes_alea_cleanup_report from public, anon, authenticated, service_role;
grant select on public.hermes_alea_cleanup_report to service_role;
