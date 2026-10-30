


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "private"."append_combat_to_journal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 insert into public.campaign_journal_entries
 (campaign_id,event_type,title,message,actor_name,outcome,details,player_visible,created_by,source_key,created_at)
 values (new.campaign_id,'combat',
  case when new.phase='magic' then 'Magi i strid' when new.phase='attack' then 'Attack i strid'
       when new.phase='damage' then 'Skada i strid' when new.phase='initiative' then 'Initiativ'
       else 'Strid · '||coalesce(new.phase,'händelse') end,
  coalesce(new.message,''),'','',coalesce(new.details,'{}'::jsonb)
      || jsonb_build_object('combat_id',new.combat_id,'combat_log_id',new.id,'round',new.round_number,'event_type',new.event_type),
  coalesce(new.player_visible,true),null,'combat:'||new.id::text,new.created_at)
 on conflict (source_key) do nothing;
 return new;
end $$;


ALTER FUNCTION "private"."append_combat_to_journal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."append_day_to_journal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
 insert into public.campaign_journal_entries
 (campaign_id,event_type,title,message,actor_name,details,player_visible,created_by,source_key,created_at)
 values (new.campaign_id,'day','Dag '||new.day_number||' inleds',
  case when coalesce(new.with_rest,false) then 'Ny dag efter vila'
       else 'Ny dag utan vila' end||
  case when coalesce(new.weather,'')<>'' then ' · Väder: '||new.weather else '' end,
  '',jsonb_build_object('day_number',new.day_number,'rest_hours',new.rest_hours,'weather',new.weather),
  true,null,'day:'||new.id::text,new.started_at)
 on conflict(source_key) do nothing;
 return new;
end $$;


ALTER FUNCTION "private"."append_day_to_journal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."bump_campaign_map_signal"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_campaign uuid;
begin
 if tg_op = 'DELETE' then
  v_campaign := old.campaign_id;
 else
  v_campaign := new.campaign_id;
 end if;
 insert into public.campaign_map_signals(campaign_id, revision)
  values (v_campaign, 1)
 on conflict (campaign_id) do update set
  revision = public.campaign_map_signals.revision + 1,
  updated_at = now();
 if tg_op = 'DELETE' then return old; end if;
 return new;
end;
$$;


ALTER FUNCTION "private"."bump_campaign_map_signal"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."haj_area_event"("p_area" "uuid", "p_combatant" "uuid", "p_round" integer, "p_event" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
 v_area record;
 v_target record;
 v_raw text;
 v_gross int:=0;
 v_ward int:=0;
 v_net int:=0;
 v_before int;
 v_after int;
 v_event_id bigint;
BEGIN
 IF p_event NOT IN ('enter','stay','exit') OR p_round<1 THEN RAISE EXCEPTION 'Invalid area event'; END IF;
 SELECT a.*,d.name AS effect_name,d.active AS definition_active,d.modifiers,
        d.target_type
 INTO v_area
 FROM public.combat_area_effects a
 JOIN public.rule_effects d ON d.id=a.effect_id
 WHERE a.id=p_area FOR SHARE OF a;
 IF NOT FOUND OR v_area.status<>'active' OR NOT v_area.definition_active
    OR v_area.target_type NOT IN ('area','hex') OR v_area.applied_round>p_round
    OR (v_area.expires_round IS NOT NULL AND v_area.expires_round<p_round)
 THEN RETURN jsonb_build_object('applied',false,'reason','inactive'); END IF;
 SELECT * INTO v_target FROM public.combatants
 WHERE id=p_combatant AND combat_id=v_area.combat_id AND campaign_id=v_area.campaign_id
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invalid area combatant'; END IF;
 v_raw:=coalesce(v_area.parameters->>('damage_on_'||p_event),'0');
 IF v_raw !~ '^[0-9]{1,4}$' THEN RAISE EXCEPTION 'Invalid area damage'; END IF;
 IF v_area.modifiers->>'type'='area_damage' THEN v_gross:=v_raw::int; END IF;
 IF v_target.current_kp IS NULL OR v_target.status IN ('dead','removed','defeated') THEN v_gross:=0; END IF;
 SELECT coalesce(max((e.parameters->>'protection_points')::int),0) INTO v_ward
 FROM public.combatant_effects e JOIN public.rule_effects d ON d.id=e.effect_id
 WHERE e.combat_id=v_area.combat_id AND e.combatant_id=p_combatant
  AND e.status='active' AND e.applied_round<=p_round
  AND (e.expires_round IS NULL OR e.expires_round>=p_round)
  AND (e.expires_at IS NULL OR e.expires_at>now())
  AND d.active AND d.modifiers->>'type'='protection'
  AND d.modifiers->>'damage_kind' IN ('all',v_area.modifiers->>'damage_kind')
  AND e.parameters->>'protection_points' ~ '^[0-9]{1,4}$';
 v_net:=greatest(0,v_gross-v_ward);
 v_before:=coalesce(v_target.current_kp,0);
 v_after:=greatest(0,v_before-v_net);
 INSERT INTO public.combat_area_events
 (area_id,combat_id,campaign_id,combatant_id,round_number,event_type,gross_damage,protection,net_damage)
 VALUES(p_area,v_area.combat_id,v_area.campaign_id,p_combatant,p_round,p_event,v_gross,v_ward,v_net)
 ON CONFLICT DO NOTHING RETURNING id INTO v_event_id;
 IF v_event_id IS NULL THEN
  RETURN jsonb_build_object('applied',false,'reason','already_resolved');
 END IF;
 IF v_net>0 THEN
  UPDATE public.combatants SET current_kp=v_after,
   status=CASE WHEN v_after=0 THEN 'dead' ELSE status END,updated_at=now()
  WHERE id=p_combatant;
 END IF;
 INSERT INTO public.combat_log
 (combat_id,campaign_id,round_number,phase,actor_id,target_id,event_type,message,details,player_visible)
 VALUES(v_area.combat_id,v_area.campaign_id,p_round,'damage',v_area.source_combatant_id,p_combatant,
  'area_'||p_event,
  v_target.name_snapshot||CASE p_event WHEN 'enter' THEN ' går in i ' WHEN 'exit' THEN ' lämnar ' ELSE ' vistas i ' END
  ||v_area.effect_name||CASE WHEN v_gross>0 THEN ' · '||v_net||' KP skada' ELSE '' END,
  jsonb_build_object('area_id',p_area,'event',p_event,'gross',v_gross,'protection',v_ward,'net',v_net,
    'kp_before',v_before,'kp_after',v_after),true);
 RETURN jsonb_build_object('applied',true,'event',p_event,'net',v_net,'kp_before',v_before,'kp_after',v_after);
END $_$;


ALTER FUNCTION "private"."haj_area_event"("p_area" "uuid", "p_combatant" "uuid", "p_round" integer, "p_event" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."haj_combatant_move"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_area record;v_event text;v_round integer;v_status text;v_old_inside boolean;v_new_inside boolean;
BEGIN
 IF current_setting('alea.haj_restore',true)='on' THEN RETURN NEW; END IF;
 SELECT round_number,status INTO v_round,v_status FROM public.combat_instances WHERE id=NEW.combat_id;
 IF v_status<>'active' OR v_round IS NULL OR NEW.status='removed' THEN RETURN NEW; END IF;
 FOR v_area IN
  SELECT a.id,a.center_q,a.center_r,a.radius
  FROM public.combat_area_effects a JOIN public.rule_effects d ON d.id=a.effect_id AND d.active
  WHERE a.combat_id=NEW.combat_id AND a.status='active' AND a.applied_round<=v_round
   AND (a.expires_round IS NULL OR a.expires_round>=v_round)
   AND d.target_type IN ('area','hex')
  ORDER BY a.id
 LOOP
  v_old_inside:=EXISTS(
   SELECT 1 FROM public.alea_footprint_cells(OLD.q,OLD.r,
    public.alea_footprint_shape(OLD.state,OLD.name_snapshot),
    coalesce((OLD.state->'footprint'->>'facing')::integer,0)) fp
   WHERE (abs(fp.q-v_area.center_q)+abs(fp.r-v_area.center_r)+
    abs(fp.q-v_area.center_q+fp.r-v_area.center_r))/2<=v_area.radius
  );
  v_new_inside:=EXISTS(
   SELECT 1 FROM public.alea_footprint_cells(NEW.q,NEW.r,
    public.alea_footprint_shape(NEW.state,NEW.name_snapshot),
    coalesce((NEW.state->'footprint'->>'facing')::integer,0)) fp
   WHERE (abs(fp.q-v_area.center_q)+abs(fp.r-v_area.center_r)+
    abs(fp.q-v_area.center_q+fp.r-v_area.center_r))/2<=v_area.radius
  );
  IF v_old_inside IS DISTINCT FROM v_new_inside THEN
   v_event:=CASE WHEN v_new_inside THEN 'enter' ELSE 'exit' END;
   PERFORM private.haj_area_event(v_area.id,NEW.id,v_round,v_event);
  END IF;
 END LOOP;
 RETURN NEW;
END $$;


ALTER FUNCTION "private"."haj_combatant_move"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."haj_validate_area"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_campaign uuid; v_target text; v_source uuid;
BEGIN
 SELECT campaign_id INTO v_campaign FROM public.combat_instances WHERE id=NEW.combat_id;
 IF v_campaign IS NULL OR v_campaign<>NEW.campaign_id THEN RAISE EXCEPTION 'Area campaign mismatch'; END IF;
 SELECT target_type INTO v_target FROM public.rule_effects WHERE id=NEW.effect_id AND active;
 IF v_target NOT IN ('area','hex') OR v_target IS NULL THEN RAISE EXCEPTION 'Area requires area/hex rule'; END IF;
 IF NEW.source_combatant_id IS NOT NULL THEN
  SELECT combat_id INTO v_source FROM public.combatants WHERE id=NEW.source_combatant_id;
  IF v_source IS DISTINCT FROM NEW.combat_id THEN RAISE EXCEPTION 'Area source belongs to another combat'; END IF;
 END IF;
 RETURN NEW;
END $$;


ALTER FUNCTION "private"."haj_validate_area"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_begin"("request" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."hermes_alea_begin"("request" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_can_manage"("kind" "text", "target" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."hermes_alea_can_manage"("kind" "text", "target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_capabilities"() RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select jsonb_build_object('enabled', enabled and auth.uid() is not null,
 'max_bytes',12000000,'max_dimension',2048,'max_pixels',4194304,'quality',0.92)
 from private.hermes_alea_settings where singleton
$$;


ALTER FUNCTION "private"."hermes_alea_capabilities"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_finalize"("job_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."hermes_alea_finalize"("job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."hermes_alea_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_link_guard"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare j public.hermes_alea_jobs;
begin
 if new.image_asset_id is distinct from old.image_asset_id and new.image_asset_id like 'hermes-alea:%' then
  select * into j from public.hermes_alea_jobs where 'hermes-alea:'||id::text=new.image_asset_id for update;
  if not found or j.output_delete_reserved_at is not null or j.output_deleted_at is not null then raise exception 'IMAGE_RESERVED_OR_MISSING'; end if;
 end if;
 return new;
end $$;


ALTER FUNCTION "private"."hermes_alea_link_guard"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_storage_allowed"("bucket" "text", "path" "text", "reading" boolean) RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
 select exists(select 1 from public.hermes_alea_jobs j where
 private.hermes_alea_can_manage(j.target_kind,j.target_id) and
 ((bucket='hermes-alea-originals' and path=j.source_path and j.requested_by=auth.uid())
  or (bucket='hermes-alea-display' and path=j.output_path)) and
 case when reading then j.output_delete_reserved_at is null and j.output_deleted_at is null
 else j.requested_by=auth.uid() and j.state='uploading' and j.verified_at is null
  and j.created_at>now()-interval '24 hours' and (select enabled from private.hermes_alea_settings where singleton) end)
$$;


ALTER FUNCTION "private"."hermes_alea_storage_allowed"("bucket" "text", "path" "text", "reading" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_target_lock"("kind" "text", "target" "uuid") RETURNS TABLE("image_key" "text", "revision" bigint)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if kind='definition' then
  return query select d.image_asset_id,d.image_revision from public.honor_definitions d where d.id=target for update;
 elsif kind='relief' then
  return query select v.image_asset_id,v.image_revision from public.honor_relief_variants v where v.id=target for update;
 else raise exception 'BAD_TARGET';
 end if;
end $$;


ALTER FUNCTION "private"."hermes_alea_target_lock"("kind" "text", "target" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."hermes_alea_target_set"("kind" "text", "target" "uuid", "newkey" "text") RETURNS bigint
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "private"."hermes_alea_target_set"("kind" "text", "target" "uuid", "newkey" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
        and is_admin = true
    );
$$;


ALTER FUNCTION "private"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_campaign_gm"("p_campaign" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select exists (
        select 1
        from public.campaign_members
        where campaign_id = p_campaign
        and user_id = (select auth.uid())
        and role = 'gm'
    );
$$;


ALTER FUNCTION "private"."is_campaign_gm"("p_campaign" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."is_campaign_member"("p_campaign" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
    select exists (
        select 1
        from public.campaign_members
        where campaign_id = p_campaign
        and user_id = (select auth.uid())
    );
$$;


ALTER FUNCTION "private"."is_campaign_member"("p_campaign" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "private"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "private"."sync_character_round_art_live"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE
  participant record;
  fallback_id uuid;
  fallback_path text;
  next_source text;
  next_path text;
  changed_instances uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Fired only when characters.round_background_path is explicitly updated.
  -- The characters RLS policy has already authorized the source edit.
  FOR participant IN
    SELECT cb.id,cb.combat_id,coalesce(cb.state,'{}'::jsonb) as state
    FROM public.combatants cb
    JOIN public.combat_instances ci ON ci.id=cb.combat_id
    WHERE cb.source_type='character'
      AND cb.source_id=NEW.id
      AND cb.campaign_id=NEW.campaign_id
      AND ci.campaign_id=NEW.campaign_id
      AND ci.status IN ('active','setup','paused')
  LOOP
    fallback_id:=NULL;
    fallback_path:=NULL;
    -- Keep the old fallback selection (even if now disabled in admin).
    SELECT bg.id,bg.image_path INTO fallback_id,fallback_path
    FROM public.rule_combat_round_backgrounds bg
    WHERE bg.id::text=participant.state->>'round_background_id'
      AND bg.archived_at IS NULL
    LIMIT 1;

    IF fallback_path IS NULL THEN
      -- Choose a stable fallback once, independently per combatant.
      SELECT bg.id,bg.image_path INTO fallback_id,fallback_path
      FROM public.rule_combat_round_backgrounds bg
      WHERE bg.is_active AND bg.archived_at IS NULL
      ORDER BY md5(participant.id::text||bg.id::text)
      LIMIT 1;
    END IF;

    next_source:=CASE WHEN NEW.round_background_path IS NULL THEN 'library' ELSE 'character' END;
    next_path:=coalesce(NEW.round_background_path,fallback_path,'assets/combat/round-hero-battle-pilot.avif');

    UPDATE public.combatants cb
    SET state=coalesce(cb.state,'{}'::jsonb)||jsonb_build_object(
      'round_background_source',next_source,
      'round_background_path',next_path,
      'round_background_id',fallback_id
    ),updated_at=clock_timestamp()
    WHERE cb.id=participant.id
      AND (
        cb.state->>'round_background_source' IS DISTINCT FROM next_source OR
        cb.state->>'round_background_path' IS DISTINCT FROM next_path OR
        cb.state->>'round_background_id' IS DISTINCT FROM fallback_id::text
      );

    IF FOUND THEN
      changed_instances:=array_append(changed_instances,participant.combat_id);
    END IF;
  END LOOP;

  -- Polling clients watch the instance timestamp, not individual combatant rows.
  IF array_length(changed_instances,1)>0 THEN
    UPDATE public.combat_instances ci
    SET updated_at=clock_timestamp()
    WHERE ci.id=ANY(changed_instances)
      AND ci.status IN ('active','setup','paused');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "private"."sync_character_round_art_live"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."activate_campaign_map"("p_map_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
declare
    v_campaign_id uuid;
begin

    select campaign_id
    into v_campaign_id
    from public.campaign_maps
    where id = p_map_id;

    if v_campaign_id is null then
        raise exception 'Kartan finns inte.';
    end if;

    if not (
        private.is_admin()
        or private.is_campaign_gm(v_campaign_id)
    ) then
        raise exception 'Du har inte behörighet att aktivera kartan.';
    end if;


    update public.campaign_maps
    set
        player_visible = true,
        first_activated_at =
            coalesce(first_activated_at, now()),
        last_activated_at = now()
    where id = p_map_id;


    insert into public.campaign_map_settings (
        campaign_id,
        active_map_id,
        updated_by,
        updated_at
    )
    values (
        v_campaign_id,
        p_map_id,
        auth.uid(),
        now()
    )
    on conflict (campaign_id)
    do update set
        active_map_id = excluded.active_map_id,
        updated_by = excluded.updated_by,
        updated_at = now();


    return p_map_id;

end;
$$;


ALTER FUNCTION "public"."activate_campaign_map"("p_map_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_global_npc_to_campaign"("p_global_npc_id" "uuid", "p_campaign_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_npc_id uuid;
begin
  if not ((select private.is_admin()) or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Not authorized for this campaign';
  end if;
  insert into public.campaign_npcs(
    campaign_id,npc_key,name,title,description,gm_notes,player_visible,active,
    created_by,attributes,skills,weapons,shield,armor,race,gender,profession,spells,
    image_path,source_global_npc_id
  )
  select p_campaign_id, 'library-'||g.npc_key||'-'||left(gen_random_uuid()::text,8),
    g.name,g.title,g.description,
    concat_ws(E'\n\n',nullif(g.gm_notes,''), 'Bakgrund: '||g.background,
      'Drivkraft: '||g.motivation,'Svaghet: '||g.weakness,'Relationer: '||g.relationships,
      'Hemligheter: '||g.secrets,'Äventyrskrokar: '||g.hooks::text,
      'Övrig utrustning: '||g.equipment_notes::text),
    false,true,(select auth.uid()),g.attributes,g.skills,g.weapons,g.shield,g.armor,
    g.race,g.gender,g.profession,g.spells,g.image_path,g.id
  from public.global_npcs g where g.id=p_global_npc_id
  returning id into v_npc_id;
  if v_npc_id is null then raise exception 'Global NPC not found or not visible'; end if;
  return v_npc_id;
end $$;


ALTER FUNCTION "public"."add_global_npc_to_campaign"("p_global_npc_id" "uuid", "p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_campaign_day"("p_campaign_id" "uuid", "p_weather" "text", "p_rest_hours" numeric) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_state public.campaign_day_state%rowtype;
  v_new_day integer;
  v_new_cycle integer;
  v_weather text := coalesce(trim(p_weather),'');
  v_rest numeric(5,2) := greatest(coalesce(p_rest_hours,0),0);
  v_full_hours integer := floor(greatest(coalesce(p_rest_hours,0),0));
  v_char record;
  v_threshold numeric(5,2);
  v_char_cycle integer;
  v_psy integer;
  v_psy_max integer;
  v_new_psy integer;
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att starta en ny dag.';
  end if;

  select *
  into v_state
  from public.campaign_day_state
  where campaign_id=p_campaign_id
  for update;

  if not found then
    insert into public.campaign_day_state
      (campaign_id,day_number,weather,with_rest,rest_hours,erf_cycle,erf_enabled,started_at,updated_by,updated_at)
    values
      (p_campaign_id,1,'',true,0,1,true,now(),auth.uid(),now())
    returning * into v_state;
  end if;

  v_new_day:=v_state.day_number+1;
  v_new_cycle:=v_state.erf_cycle + case when v_rest>=6 then 1 else 0 end;

  update public.campaign_day_state
  set day_number=v_new_day,
      weather=v_weather,
      with_rest=(v_rest>0),
      rest_hours=v_rest,
      erf_cycle=v_new_cycle,
      erf_enabled=(v_rest>=6),
      started_at=now(),
      updated_by=auth.uid(),
      updated_at=now()
  where campaign_id=p_campaign_id
  returning * into v_state;

  insert into public.campaign_day_history
    (campaign_id,day_number,weather,with_rest,rest_hours,erf_cycle,started_at,started_by)
  values
    (p_campaign_id,v_state.day_number,v_state.weather,v_state.with_rest,v_state.rest_hours,v_state.erf_cycle,v_state.started_at,auth.uid())
  on conflict (campaign_id,day_number) do update set
    weather=excluded.weather,
    with_rest=excluded.with_rest,
    rest_hours=excluded.rest_hours,
    erf_cycle=excluded.erf_cycle,
    started_at=excluded.started_at,
    started_by=excluded.started_by;

  for v_char in
    select c.id,c.data
    from public.characters c
    where c.campaign_id=p_campaign_id
    for update
  loop
    v_threshold := case
      when exists (
        select 1
        from public.rule_races rr
        where lower(trim(rr.name)) = lower(trim(coalesce(v_char.data->'identity'->>'ras','')))
          and rr.category = 'Älvfolk'
      ) then 2
      else 6
    end;

    insert into public.character_rest_state
      (character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
    values
      (v_char.id,p_campaign_id,coalesce(v_state.erf_cycle,1),v_new_day,v_rest,v_new_day,now())
    on conflict (character_id) do nothing;

    select erf_cycle into v_char_cycle
    from public.character_rest_state
    where character_id=v_char.id
    for update;

    if v_rest>=v_threshold then
      v_char_cycle:=v_char_cycle+1;
      update public.character_rest_state
      set erf_cycle=v_char_cycle,
          last_erf_reset_day=v_new_day,
          last_day_number=v_new_day,
          last_rest_hours=v_rest,
          updated_at=now()
      where character_id=v_char.id;
    else
      update public.character_rest_state
      set last_day_number=v_new_day,
          last_rest_hours=v_rest,
          updated_at=now()
      where character_id=v_char.id;
    end if;

    if v_full_hours>0 then
      v_psy := coalesce(nullif(v_char.data->'live'->>'PSY','')::integer,0);
      v_psy_max := coalesce(
        nullif(v_char.data->'live'->>'PSYmax','')::integer,
        nullif(v_char.data->'base'->'Psykisk kraft'->>'v','')::integer,
        v_psy
      );
      v_new_psy := least(v_psy_max, v_psy + v_full_hours);

      update public.characters
      set data=jsonb_set(
            data,
            '{live}',
            coalesce(data->'live','{}'::jsonb) || jsonb_build_object('PSY',v_new_psy),
            true
          ),
          updated_at=now()
      where id=v_char.id;
    end if;
  end loop;

  return to_jsonb(v_state);
end
$$;


ALTER FUNCTION "public"."advance_campaign_day"("p_campaign_id" "uuid", "p_weather" "text", "p_rest_hours" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alea_create_location_state"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    insert into public.campaign_location_state (
        location_id,
        campaign_id,
        status
    )
    values (
        new.id,
        new.campaign_id,
        'unknown'
    )
    on conflict (location_id) do nothing;

    return new;
end;
$$;


ALTER FUNCTION "public"."alea_create_location_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alea_footprint_cells"("p_q" integer, "p_r" integer, "p_shape" "text", "p_facing" integer DEFAULT 0) RETURNS TABLE("q" integer, "r" integer)
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare v_dx integer;v_dr integer;v_next integer;v_turn integer;v_dir integer;
begin
 if p_shape not in ('single','line2','triangle3','line3','giant7') then
  raise exception 'Unknown footprint shape';
 end if;
 v_dir:=mod(mod(coalesce(p_facing,0),6)+6,6);
 for v_dx,v_dr in
  select offsets.dx,offsets.dr from (
   values (0,0, 'single'),(0,0,'line2'),(1,0,'line2'),
    (0,0,'triangle3'),(1,0,'triangle3'),(0,1,'triangle3'),
    (0,0,'line3'),(1,0,'line3'),(2,0,'line3'),
    (0,0,'giant7'),(1,0,'giant7'),(0,1,'giant7'),
    (-1,1,'giant7'),(-1,0,'giant7'),(0,-1,'giant7'),(1,-1,'giant7')
  ) as offsets(dx,dr,shape)
  where offsets.shape=p_shape
 loop
  for v_turn in 1..v_dir loop
   v_next:=-v_dr;v_dr:=v_dx+v_dr;v_dx:=v_next;
  end loop;
  q:=p_q+v_dx;r:=p_r+v_dr;return next;
 end loop;
end $$;


ALTER FUNCTION "public"."alea_footprint_cells"("p_q" integer, "p_r" integer, "p_shape" "text", "p_facing" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alea_footprint_shape"("p_state" "jsonb", "p_name" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
 select case
 when p_state->'footprint'->>'shape' in ('single','line2','triangle3','line3','giant7')
  then p_state->'footprint'->>'shape'
 when coalesce(p_name,'') ~* 'rese' then 'triangle3'
 when coalesce(p_name,'') ~* 'krokodil' then 'line3'
 when coalesce(p_name,'') ~* 'häst|horse|åsna|donkey|lejon|tiger' then 'line2'
 else 'single' end
$$;


ALTER FUNCTION "public"."alea_footprint_shape"("p_state" "jsonb", "p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alea_move_multhex"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare v_actor record;v_cell record;v_step jsonb;
 v_shape text;v_facing integer;v_q integer;v_r integer;
 v_prior_q integer;v_prior_r integer;v_flying boolean;v_res jsonb;
begin
 select c.*,i.active_actor_id,i.phase,i.status as battle_status
 into v_actor from public.combatants c
 join public.combat_instances i on i.id=c.combat_id
 where c.id=p_combatant_id for update of c;
 if not found then raise exception 'Combatant not found';end if;
 if not (private.is_admin() or private.is_campaign_gm(v_actor.campaign_id)) then
  raise exception 'Only the GM may move a combatant';
 end if;
 if v_actor.battle_status<>'active' or v_actor.phase<>'movement'
 or v_actor.active_actor_id is distinct from p_combatant_id
 or v_actor.status in ('dead','removed','defeated')
 or v_actor.q is distinct from p_from_q or v_actor.r is distinct from p_from_r
 or v_actor.movement_remaining is distinct from p_expected_remaining then
  raise exception 'Outdated movement or inactive combatant';
 end if;
 if p_path is null or jsonb_typeof(p_path)<>'array'
 or jsonb_array_length(p_path) not between 1 and 160 then
  raise exception 'Invalid movement path';
 end if;
 v_shape:=public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot);
 v_facing:=coalesce((v_actor.state->'footprint'->>'facing')::integer,0);
 v_flying:=coalesce(v_actor.flying,false) or exists(
  select 1 from public.combatant_effects e join public.rule_effects d on d.id=e.effect_id
  where e.combat_id=v_actor.combat_id and e.combatant_id=p_combatant_id
  and e.status='active' and d.active and d.modifiers->>'type'='flight'
  and d.modifiers->>'ignore_terrain'='true');
 v_prior_q:=v_actor.q;v_prior_r:=v_actor.r;
 for v_step in select value from jsonb_array_elements(p_path) loop
  if jsonb_typeof(v_step)<>'object' or coalesce(v_step->>'q','') !~ '^[-]?[0-9]{1,6}$'
   or coalesce(v_step->>'r','') !~ '^[-]?[0-9]{1,6}$' then
    raise exception 'Invalid hex step';
  end if;
  v_q:=(v_step->>'q')::integer;v_r:=(v_step->>'r')::integer;
  if (abs(v_q-v_prior_q)+abs(v_r-v_prior_r)+abs(v_q-v_prior_q+v_r-v_prior_r))<>2 then
   raise exception 'Nonadjacent movement path';
  end if;
  for v_cell in select * from public.alea_footprint_cells(v_q,v_r,v_shape,v_facing) loop
   if exists(
    select 1 from public.combat_hexes h where h.combat_id=v_actor.combat_id
    and h.q=v_cell.q and h.r=v_cell.r
    and (coalesce(h.notes,'') ~* '(^|[[:space:],;|])(wall|vägg|mur)($|[[:space:],;|])'
      or (h.movement_mode='blocked' and not v_flying))
   ) then raise exception 'Footprint intersects wall or blocked terrain'; end if;
   if exists(
    select 1 from public.combatants other
     cross join lateral public.alea_footprint_cells(
      other.q,other.r,public.alea_footprint_shape(other.state,other.name_snapshot),
      coalesce((other.state->'footprint'->>'facing')::integer,0)) pos
    where other.combat_id=v_actor.combat_id and other.id<>p_combatant_id
     and other.status<>'removed' and pos.q=v_cell.q and pos.r=v_cell.r
   ) then raise exception 'Footprint intersects another combatant';end if;
  end loop;
  v_prior_q:=v_q;v_prior_r:=v_r;
 end loop;
 -- Preserve the existing authoritative movement cost, effects and interruption logic.
 v_res:=public.haj_move_combatant(p_combatant_id,p_from_q,p_from_r,p_expected_remaining,p_path);
 return v_res;
end $_$;


ALTER FUNCTION "public"."alea_move_multhex"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alea_rotate_multhex"("p_combatant_id" "uuid", "p_facing" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare v_actor record;v_cell record;v_shape text;v_facing integer;
begin
 select c.*,i.status as battle_status into v_actor
 from public.combatants c join public.combat_instances i on i.id=c.combat_id
 where c.id=p_combatant_id for update of c;
 if not found then raise exception 'Combatant not found';end if;
 if not(private.is_admin() or private.is_campaign_gm(v_actor.campaign_id)) then
  raise exception 'Only the GM may rotate a combatant';
 end if;
 if v_actor.battle_status not in ('setup','active','paused') or v_actor.status in ('dead','removed','defeated')
  then raise exception 'Combatant cannot rotate now';end if;
 if p_facing not between 0 and 5 then raise exception 'Invalid facing';end if;
 v_shape:=public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot);
 for v_cell in select * from public.alea_footprint_cells(v_actor.q,v_actor.r,v_shape,p_facing) loop
  if exists(
   select 1 from public.combat_hexes h where h.combat_id=v_actor.combat_id
    and h.q=v_cell.q and h.r=v_cell.r and
    (h.movement_mode='blocked' or coalesce(h.notes,'') ~* '(^|[[:space:],;|])(wall|vägg|mur)($|[[:space:],;|])')
  ) then raise exception 'Rotation crosses blocked terrain';end if;
  if exists(
   select 1 from public.combatants other cross join lateral public.alea_footprint_cells(
    other.q,other.r,public.alea_footprint_shape(other.state,other.name_snapshot),
    coalesce((other.state->'footprint'->>'facing')::integer,0)) pos
   where other.combat_id=v_actor.combat_id and other.id<>p_combatant_id
    and other.status<>'removed' and pos.q=v_cell.q and pos.r=v_cell.r
  ) then raise exception 'Rotation intersects another combatant';end if;
 end loop;
 update public.combatants set state=jsonb_set(
  coalesce(v_actor.state,'{}'::jsonb),'{footprint}',
  jsonb_build_object('shape',v_shape,'facing',p_facing),true),updated_at=now()
 where id=p_combatant_id;
 return jsonb_build_object('id',p_combatant_id,'facing',p_facing,'shape',v_shape);
end $_$;


ALTER FUNCTION "public"."alea_rotate_multhex"("p_combatant_id" "uuid", "p_facing" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."alea_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
    new.updated_at = now();
    return new;
end;
$$;


ALTER FUNCTION "public"."alea_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aragorn_sync_legacy_materials"("p_campaign_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare
  source_row record;
  registered_id uuid;
  added_count integer := 0;
  linked_count integer := 0;
  skipped_count integer := 0;
  changed_count integer;
  kind_mime text;
begin
  if p_campaign_id is null or (
    current_user not in ('postgres','supabase_admin') and
    not (select private.is_admin()) and
    not (select private.is_campaign_gm(p_campaign_id))
  ) then
    raise exception 'Only this campaign GM may synchronize library assets' using errcode='42501';
  end if;

  for source_row in
    select n.campaign_id, n.image_path as path, 'campaign-actor-images'::text as bucket,
           n.name as title, 'npc'::text as category, 'npc'::text as entity_type, n.id as entity_id
      from public.campaign_npcs n where n.campaign_id=p_campaign_id and n.image_path is not null
    union all
    select m.campaign_id, m.image_path, 'campaign-actor-images'::text,
           m.name, 'monster'::text, 'monster'::text, m.id
      from public.campaign_monsters m where m.campaign_id=p_campaign_id and m.image_path is not null
    union all
    select a.campaign_id, a.storage_path, 'campaign-location-assets'::text,
           coalesce(nullif(btrim(a.title),''), l.name), 'location'::text, 'location'::text, a.location_id
      from public.campaign_location_assets a
      join public.campaign_locations l on l.id=a.location_id and l.campaign_id=a.campaign_id
      where a.campaign_id=p_campaign_id and a.asset_kind='image'
    union all
    select s.campaign_id, s.background_image_path, 'combat-scene-maps'::text,
           s.name, 'map'::text, 'combat_scene'::text, s.id
      from public.campaign_combat_scenes s
      where s.campaign_id=p_campaign_id and s.background_image_path is not null
    union all
    select cm.campaign_id, cm.image_path, 'campaign-maps'::text,
           cm.name, 'map'::text, null::text, null::uuid
      from public.campaign_maps cm where cm.campaign_id=p_campaign_id and cm.image_path is not null
  loop
    -- Refuse malformed, foreign-campaign and non-image legacy references.
    if source_row.path is null
       or split_part(source_row.path,'/',1) <> p_campaign_id::text
       or source_row.path like '%..%' or source_row.path like '%//%'
       or source_row.path !~* '\.(png|jpe?g|webp)$'
    then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    kind_mime := case
      when source_row.path ~* '\.png$' then 'image/png'
      when source_row.path ~* '\.jpe?g$' then 'image/jpeg'
      else 'image/webp' end;

    registered_id := null;
    insert into public.campaign_materials(
      campaign_id,title,description,category,asset_kind,storage_bucket,
      storage_path,mime_type,original_filename
    ) values (
      p_campaign_id,left(coalesce(nullif(btrim(source_row.title),''),'Namnlös bild'),160),
      '',source_row.category,'image',source_row.bucket,source_row.path,
      kind_mime, left(regexp_replace(source_row.path,'^.*/',''),160)
    )
    on conflict (campaign_id,storage_bucket,storage_path) do nothing
    returning id into registered_id;
    get diagnostics changed_count = row_count;
    added_count := added_count + changed_count;

    if registered_id is null then
      select id into registered_id from public.campaign_materials
       where campaign_id=p_campaign_id and storage_bucket=source_row.bucket
         and storage_path=source_row.path;
    end if;
    if registered_id is null then
      raise exception 'Could not register legacy material' using errcode='23514';
    end if;

    if source_row.entity_type is not null then
      insert into public.campaign_material_links(campaign_id,material_id,entity_type,entity_id)
      values (p_campaign_id,registered_id,source_row.entity_type,source_row.entity_id)
      on conflict (campaign_id,material_id,entity_type,entity_id) do nothing;
      get diagnostics changed_count = row_count;
      linked_count := linked_count + changed_count;
    end if;
  end loop;
  return jsonb_build_object('added',added_count,'links_added',linked_count,'skipped',skipped_count);
end;
$_$;


ALTER FUNCTION "public"."aragorn_sync_legacy_materials"("p_campaign_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."arcane_gallery_capture_presentation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if new.material_id is not null and
    exists(select 1 from public.campaign_materials m
      where m.campaign_id=new.campaign_id and m.id=new.material_id
       and m.asset_kind='image' and m.archived_at is null) then
  insert into public.campaign_material_presentation_history
    (campaign_id,revision,material_id,shown_by,shown_at)
  values (new.campaign_id,new.revision,new.material_id,new.shown_by,coalesce(new.shown_at,now()))
  on conflict (campaign_id,revision) do nothing;
 end if;
 return new;
end
$$;


ALTER FUNCTION "public"."arcane_gallery_capture_presentation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."award_character_erf"("p_character_id" "uuid", "p_item_group" "text", "p_item_key" "text", "p_amount" integer, "p_reason" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_character public.characters%rowtype;
  v_day public.campaign_day_state%rowtype;
  v_rest public.character_rest_state%rowtype;
  v_item jsonb;
  v_index integer;
  v_current_erf integer;
  v_new_erf integer;
  v_inserted uuid;
  v_rule_name text;
  v_rule_bc text;
begin
  if p_item_group not in ('skills','baseChanceSkills','weapons','shields','spells') then
    raise exception 'Ogiltig ERF-grupp.';
  end if;
  if coalesce(trim(p_item_key),'')='' then raise exception 'Färdigheten saknar en stabil identifierare.'; end if;
  if p_amount is null or p_amount<1 or p_amount>4 then raise exception 'Ogiltigt antal ERF.'; end if;
  if p_reason not in ('success','special','perfect','manual') then raise exception 'Ogiltig ERF-orsak.'; end if;
  if p_reason in ('success','special') and p_amount<>1 then raise exception 'Lyckat eller särskilt slag ger 1 ERF.'; end if;
  if p_reason='perfect' and p_amount not between 2 and 4 then raise exception 'Perfekt slag ger 1T3+1 ERF (2–4).'; end if;

  select * into v_character from public.characters where id=p_character_id for update;
  if not found then raise exception 'Rollpersonen finns inte.'; end if;

  if not (private.is_admin() or private.is_campaign_gm(v_character.campaign_id) or v_character.owner_id=auth.uid()) then
    raise exception 'Du har inte behörighet att ändra ERF för rollpersonen.';
  end if;

  select * into v_day from public.campaign_day_state where campaign_id=v_character.campaign_id;
  if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;

  select * into v_rest from public.character_rest_state where character_id=v_character.id for update;
  if not found then
    insert into public.character_rest_state
    (character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
    values (v_character.id,v_character.campaign_id,coalesce(v_day.erf_cycle,1),v_day.day_number,coalesce(v_day.rest_hours,0),v_day.day_number,now())
    returning * into v_rest;
  end if;

  if p_item_group in ('skills','baseChanceSkills') and exists (
    select 1
    from public.character_erf_awards a
    where a.campaign_id=v_character.campaign_id
      and a.character_id=v_character.id
      and a.item_group in ('skills','baseChanceSkills')
      and a.item_key=p_item_key
      and a.erf_cycle=v_rest.erf_cycle
  ) then
    raise exception 'Färdigheten har redan tjänat ERF under den aktuella viloperioden.';
  end if;

  if p_item_group='baseChanceSkills' then
    if p_item_key !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
      raise exception 'Baschansfärdigheten saknar giltig regelkoppling.';
    end if;

    select name,bc into v_rule_name,v_rule_bc
    from public.rule_skills
    where id=p_item_key::uuid;

    if not found or coalesce(trim(v_rule_bc),'') in ('','0','—','NONE') then
      raise exception 'Färdigheten har ingen baschans.';
    end if;

    select e.value,(e.ordinality-1)::integer
    into v_item,v_index
    from jsonb_array_elements(coalesce(v_character.data->'baseChanceSkills','[]'::jsonb))
         with ordinality as e(value,ordinality)
    where e.value->>'skillId'=p_item_key
    limit 1;

    if v_index is null then
      v_character.data:=jsonb_set(
        v_character.data,
        '{baseChanceSkills}',
        coalesce(v_character.data->'baseChanceSkills','[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('skillId',p_item_key,'name',v_rule_name,'erf',0)),
        true
      );

      update public.characters set data=v_character.data,updated_at=now() where id=v_character.id;

      select e.value,(e.ordinality-1)::integer
      into v_item,v_index
      from jsonb_array_elements(coalesce(v_character.data->'baseChanceSkills','[]'::jsonb))
           with ordinality as e(value,ordinality)
      where e.value->>'skillId'=p_item_key
      limit 1;
    end if;
  else
    select e.value,(e.ordinality-1)::integer
    into v_item,v_index
    from jsonb_array_elements(coalesce(v_character.data->p_item_group,'[]'::jsonb))
         with ordinality as e(value,ordinality)
    where case
      when p_item_group='skills' then coalesce(nullif(e.value->>'skillId',''),e.value->>'name')=p_item_key
      when p_item_group in ('weapons','shields') then coalesce(nullif(e.value->>'equipId',''),e.value->>'name')=p_item_key
      else coalesce(nullif(e.value->>'id',''),e.value->>'name')=p_item_key
    end
    limit 1;
  end if;

  if v_index is null then raise exception 'Färdigheten kunde inte hittas på rollpersonen.'; end if;

  insert into public.character_erf_awards
  (campaign_id,character_id,item_group,item_key,day_number,erf_cycle,amount,reason,awarded_by)
  values (v_character.campaign_id,v_character.id,p_item_group,p_item_key,v_day.day_number,v_rest.erf_cycle,p_amount,p_reason,auth.uid())
  on conflict (campaign_id,character_id,item_group,item_key,erf_cycle) do nothing
  returning id into v_inserted;

  if v_inserted is null then raise exception 'Färdigheten har redan tjänat ERF under den aktuella viloperioden.'; end if;

  v_current_erf:=coalesce(nullif(v_item->>'erf','')::integer,0);
  v_new_erf:=v_current_erf+p_amount;

  update public.characters
  set data=jsonb_set(data,array[p_item_group,v_index::text,'erf'],to_jsonb(v_new_erf),true),
      updated_at=now()
  where id=v_character.id;

  return jsonb_build_object(
    'new_erf',v_new_erf,'awarded',p_amount,'reason',p_reason,
    'day_number',v_day.day_number,'erf_cycle',v_rest.erf_cycle,
    'item_group',p_item_group,'item_key',p_item_key
  );
end
$_$;


ALTER FUNCTION "public"."award_character_erf"("p_character_id" "uuid", "p_item_group" "text", "p_item_key" "text", "p_amount" integer, "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bilbo_guard_material_archive"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if new.archived_at is not null and old.archived_at is null then
   if exists (select 1 from public.campaign_material_shares s
       where s.campaign_id=old.campaign_id and s.material_id=old.id and s.revoked_at is null)
      or exists (select 1 from public.campaign_material_presentations p
       where p.campaign_id=old.campaign_id and p.material_id=old.id) then
      raise exception 'Material currently shared or presented must be withdrawn before archiving'
        using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;


ALTER FUNCTION "public"."bilbo_guard_material_archive"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."combat_finish_and_recover"("p_combat_id" "uuid", "p_allow_recovery" boolean, "p_percent" integer DEFAULT 85) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
 v_combat public.combat_instances%rowtype;
 e public.combat_ammunition_spends%rowtype;
 v_ok boolean;v_roll integer;v_total integer:=0;v_recovered integer:=0;
 v_rows jsonb;v_idx integer;v_qty integer;v_name text;
 v_result jsonb:='[]'::jsonb;
begin
 if p_percent<80 or p_percent>90 then raise exception 'Återhämtningen ska ligga mellan 80 och 90 procent.';end if;
 select * into v_combat from public.combat_instances where id=p_combat_id for update;
 if not found then raise exception 'Striden saknas.';end if;
 if not(private.is_admin() or private.is_campaign_gm(v_combat.campaign_id)) then raise exception 'Bara SL kan avsluta striden.';end if;
 if v_combat.status not in ('active','paused') then raise exception 'Striden är redan avslutad eller ännu inte startad.';end if;
 for e in select * from public.combat_ammunition_spends where combat_id=p_combat_id order by created_at,action_id for update loop
  v_roll:=floor(random()*100)::integer+1;
  v_ok:=coalesce(p_allow_recovery,false) and v_roll<=p_percent;
  v_total:=v_total+1;
  if v_ok then
   v_recovered:=v_recovered+1;
   if e.character_id is not null then
    select data->'projectiles' into v_rows from public.characters where id=e.character_id for update;
   else
    select state->'attack_profile'->'projectiles' into v_rows from public.combatants where id=e.combatant_id for update;
   end if;
   v_rows:=coalesce(v_rows,'[]'::jsonb);v_idx:=null;
   select (p.ord-1)::integer into v_idx
    from jsonb_array_elements(v_rows) with ordinality as p(row,ord)
    where p.row->>'projectileKey'=e.projectile_key order by p.ord limit 1;
   if v_idx is null then
    select name into v_name from public.rule_projectile_types where projectile_key=e.projectile_key;
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
      'projectileKey',e.projectile_key,'name',coalesce(v_name,e.projectile_key),'count',1));
   else
    v_qty:=coalesce((v_rows->v_idx->>'count')::integer,0);
    v_rows:=jsonb_set(v_rows,array[v_idx::text,'count'],to_jsonb(v_qty+1),true);
   end if;
   if e.character_id is not null then
    update public.characters set data=jsonb_set(data,'{projectiles}',v_rows,true),updated_at=now() where id=e.character_id;
   else
    update public.combatants set state=jsonb_set(state,'{attack_profile,projectiles}',v_rows,true),updated_at=now() where id=e.combatant_id;
   end if;
  end if;
  update public.combat_ammunition_spends set recovered=v_ok,recovery_attempted=true where action_id=e.action_id;
  v_result:=v_result||jsonb_build_array(jsonb_build_object(
    'combatant_id',e.combatant_id,'projectile_key',e.projectile_key,'roll',v_roll,'recovered',v_ok));
 end loop;
 update public.combat_instances set status='completed',updated_at=now() where id=p_combat_id;
 return jsonb_build_object('total',v_total,'recovered',v_recovered,'lost',v_total-v_recovered,
  'allowed',coalesce(p_allow_recovery,false),'percent',p_percent,'items',v_result);
end $$;


ALTER FUNCTION "public"."combat_finish_and_recover"("p_combat_id" "uuid", "p_allow_recovery" boolean, "p_percent" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."combat_refund_ammunition"("p_action_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare e public.combat_ammunition_spends%rowtype; a public.combat_actions%rowtype;
begin
 select * into a from public.combat_actions where id=p_action_id for update;
 if not found or a.status<>'resolving' then return false;end if;
 if not(private.is_admin() or private.is_campaign_gm(a.campaign_id)) then raise exception 'Behörighet saknas.';end if;
 select * into e from public.combat_ammunition_spends where action_id=p_action_id for update;
 if not found then return false;end if;
 if e.character_id is not null then
  update public.characters c set data=jsonb_set(c.data,'{projectiles}',coalesce((
   select jsonb_agg(case when p->>'projectileKey'=e.projectile_key then
    jsonb_set(p,'{count}',to_jsonb(coalesce((p->>'count')::integer,0)+1),true) else p end order by ord)
   from jsonb_array_elements(c.data->'projectiles') with ordinality as x(p,ord)
  ),'[]'::jsonb),true) where id=e.character_id;
 else
  update public.combatants b set state=jsonb_set(b.state,'{attack_profile,projectiles}',coalesce((
   select jsonb_agg(case when p->>'projectileKey'=e.projectile_key then
    jsonb_set(p,'{count}',to_jsonb(coalesce((p->>'count')::integer,0)+1),true) else p end order by ord)
   from jsonb_array_elements(b.state->'attack_profile'->'projectiles') with ordinality as x(p,ord)
  ),'[]'::jsonb),true) where id=e.combatant_id;
 end if;
 delete from public.combat_ammunition_spends where action_id=p_action_id;
 update public.combat_actions set status='planned' where id=p_action_id;
 return true;
end $$;


ALTER FUNCTION "public"."combat_refund_ammunition"("p_action_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."combat_spend_ammunition"("p_action_id" "uuid", "p_weapon_key" "text", "p_projectile_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
 a public.combat_actions%rowtype; b public.combatants%rowtype; c public.characters%rowtype;
 v_profile jsonb;v_rows jsonb;v_i integer;v_count integer;v_weapon jsonb;v_rule_key text;
 v_character_id uuid;
begin
 select * into a from public.combat_actions where id=p_action_id for update;
 if not found then raise exception 'Attackhandlingen saknas.';end if;
 if not(private.is_admin() or private.is_campaign_gm(a.campaign_id)) then raise exception 'Bara SL kan genomföra stridsattacker.';end if;
 select * into b from public.combatants where id=a.combatant_id and combat_id=a.combat_id for update;
 if not found or a.action_type<>'attack' then raise exception 'Ogiltig attackhandling.';end if;
 if exists(select 1 from public.combat_ammunition_spends where action_id=a.id) then
  return jsonb_build_object('already_spent',true,'projectile_key',p_projectile_key);
 end if;
 if a.status<>'planned' then raise exception 'Attacken kan inte genomföras igen.';end if;
 if b.source_type='character' then
  select * into c from public.characters where id=b.source_id and campaign_id=a.campaign_id for update;
  if not found then raise exception 'Rollpersonens utrustning saknas.';end if;
  v_profile:=c.data;
  v_character_id:=c.id;
 else
  v_profile:=coalesce(b.state->'attack_profile','{}'::jsonb);
  v_character_id:=null;
 end if;
 select w into v_weapon from jsonb_array_elements(coalesce(v_profile->'weapons','[]'::jsonb)) w
 where coalesce(w->>'equipId',w->>'weapon_id',w->>'weaponTypeId',w->>'name')=p_weapon_key limit 1;
 if v_weapon is null then raise exception 'Vapnet finns inte hos kombatanten.';end if;
 select projectile_key into v_rule_key from public.rule_weapons
 where id::text=coalesce(v_weapon->>'weaponTypeId',v_weapon->>'weapon_id','')
    or (name=v_weapon->>'name' and category in ('projectile','thrown'))
 order by (id::text=coalesce(v_weapon->>'weaponTypeId',v_weapon->>'weapon_id','')) desc limit 1;
 if v_rule_key is null or v_rule_key<>p_projectile_key then raise exception 'Fel ammunition för vapnet.';end if;
 v_rows:=coalesce(v_profile->'projectiles','[]'::jsonb);
 select (e.ord-1)::integer,coalesce(nullif(e.row->>'count','')::integer,0)
 into v_i,v_count
 from jsonb_array_elements(v_rows) with ordinality as e(row,ord)
 where coalesce(e.row->>'projectileKey',e.row->>'projectile_key')=p_projectile_key
 order by e.ord limit 1;
 if v_i is null or v_count<=0 then raise exception 'Slut på ammunition!';end if;
 v_rows:=jsonb_set(v_rows,array[v_i::text,'count'],to_jsonb(v_count-1),true);
 if v_character_id is not null then
  update public.characters set data=jsonb_set(data,'{projectiles}',v_rows,true),updated_at=now() where id=v_character_id;
 else
  update public.combatants set state=jsonb_set(state,'{attack_profile,projectiles}',v_rows,true),updated_at=now() where id=b.id;
 end if;
 insert into public.combat_ammunition_spends(action_id,combat_id,combatant_id,character_id,projectile_key,weapon_key)
 values (a.id,a.combat_id,b.id,v_character_id,p_projectile_key,p_weapon_key);
 update public.combat_actions set status='resolving',updated_at=now() where id=a.id;
 return jsonb_build_object('already_spent',false,'projectile_key',p_projectile_key,'remaining',v_count-1);
end $$;


ALTER FUNCTION "public"."combat_spend_ammunition"("p_action_id" "uuid", "p_weapon_key" "text", "p_projectile_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_character_provisions_on_day_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare
  v_elapsed integer;
begin
  v_elapsed := new.day_number - old.day_number;
  if v_elapsed <= 0 then
    return new;
  end if;

  update public.characters c
  set data = jsonb_set(
    case when c.data ? 'provisionsDays' then
      jsonb_set(
        c.data,
        '{provisionsDays}',
        to_jsonb(greatest(
          0,
          (case
            when coalesce(c.data->>'provisionsDays','') ~ '^[0-9]{1,6}$'
              then (c.data->>'provisionsDays')::integer
            else 0
           end) - greatest(
             0,
             v_elapsed - (case
               when coalesce(c.data->>'innMealDay','') ~ '^[0-9]{1,6}$'
               then (case
                 when (c.data->>'innMealDay')::integer >= old.day_number
                  and (c.data->>'innMealDay')::integer < new.day_number
                 then 1 else 0
               end)
               else 0
             end)
           )
        )),
        true
      )
    else c.data end,
    '{waterDays}',
    to_jsonb(greatest(
      0,
      (case
        when coalesce(c.data->>'waterDays','') ~ '^[0-9]{1,6}$'
          then (c.data->>'waterDays')::integer
        else 0
       end) - v_elapsed
    )),
    c.data ? 'waterDays'
  ),
  updated_at = now()
  where c.campaign_id = new.campaign_id
    and (c.data ? 'provisionsDays' or c.data ? 'waterDays');

  return new;
end
$_$;


ALTER FUNCTION "public"."consume_character_provisions_on_day_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."frodo_set_presentation"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_expected_revision" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_revision bigint;
  v_available boolean;
begin
  if p_campaign_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid campaign or presentation revision' using errcode='22023';
  end if;
  if not (select private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Only the campaign GM can present material' using errcode='42501';
  end if;
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id) then
    raise exception 'Campaign does not exist' using errcode='23503';
  end if;
  if p_material_id is not null then
    -- SHARE lock serializes with archiving; a player cannot be shown archived material.
    select true into v_available from public.campaign_materials m
     where m.id=p_material_id and m.campaign_id=p_campaign_id
       and m.archived_at is null
     for share;
    if not coalesce(v_available,false) then
      raise exception 'Material is archived or does not belong to this campaign'
        using errcode='23514';
    end if;
  end if;
  if p_expected_revision <> 0 and not exists (
    select 1 from public.campaign_material_presentations p
     where p.campaign_id=p_campaign_id
  ) then
    raise exception 'Presentation changed; refresh before retrying' using errcode='P0001';
  end if;

  insert into public.campaign_material_presentations as current_presentation(
   campaign_id, material_id, shown_by, shown_at, revision, updated_at
  ) values (
   p_campaign_id,p_material_id,(select auth.uid()),
   case when p_material_id is null then null else now() end,
   1,now()
  )
  on conflict(campaign_id) do update
    set material_id=excluded.material_id,
        shown_by=excluded.shown_by,
        shown_at=excluded.shown_at,
        revision=current_presentation.revision+1,
        updated_at=now()
   where current_presentation.revision=p_expected_revision
  returning revision into v_revision;

  if v_revision is null then
    raise exception 'Presentation changed; refresh before retrying' using errcode='P0001';
  end if;

  return jsonb_build_object('campaign_id',p_campaign_id,
      'material_id',p_material_id,'revision',v_revision);
end;
$$;


ALTER FUNCTION "public"."frodo_set_presentation"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_expected_revision" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."frodo_validate_presentation"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.material_id is not null and not exists (
    select 1 from public.campaign_materials m
     where m.id=new.material_id and m.campaign_id=new.campaign_id
       and m.archived_at is null
  ) then
    raise exception 'Cannot present archived or foreign campaign material' using errcode='23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."frodo_validate_presentation"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."galadriel_signal_material_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare v_campaign uuid;
begin
 v_campaign := case when tg_op = 'DELETE' then old.campaign_id else new.campaign_id end;
 if tg_table_name = 'campaign_material_presentations' then
   insert into public.campaign_material_signals(campaign_id,presentation_revision)
    values(v_campaign,1)
   on conflict(campaign_id) do update set
    presentation_revision=public.campaign_material_signals.presentation_revision+1,
    updated_at=now();
 elsif tg_table_name = 'campaign_material_shares' then
   insert into public.campaign_material_signals(campaign_id,folder_revision)
    values(v_campaign,1)
   on conflict(campaign_id) do update set
    folder_revision=public.campaign_material_signals.folder_revision+1,
    updated_at=now();
 end if;
 return case when tg_op = 'DELETE' then old else new end;
end;
$$;


ALTER FUNCTION "public"."galadriel_signal_material_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haj_move_combatant"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
 v_actor record;v_step jsonb;v_q integer;v_r integer;
 v_q_before integer;v_r_before integer;
 v_cost numeric;v_remaining numeric;v_spent numeric:=0;
 v_terrain text;v_notes text;v_flight boolean;
 v_area_difficult boolean;v_area_blocked boolean;
 v_step_count integer;v_index integer:=0;v_status text;v_current_kp integer;
 v_cond record;v_old_distance integer;v_new_distance integer;
BEGIN
 SELECT c.*,i.active_actor_id AS current_actor,i.phase AS combat_phase,
  i.status AS combat_status,i.round_number AS current_round
 INTO v_actor FROM public.combatants c
 JOIN public.combat_instances i ON i.id=c.combat_id
 WHERE c.id=p_combatant_id FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Combatant not found'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_actor.campaign_id)) THEN
  RAISE EXCEPTION 'Only the GM can commit combat movement';
 END IF;
 IF v_actor.combat_status<>'active' OR v_actor.combat_phase<>'movement'
    OR v_actor.current_actor IS DISTINCT FROM p_combatant_id
    OR v_actor.status IN ('dead','removed','defeated')
    OR v_actor.q IS DISTINCT FROM p_from_q OR v_actor.r IS DISTINCT FROM p_from_r
    OR v_actor.movement_remaining IS DISTINCT FROM p_expected_remaining
 THEN RAISE EXCEPTION 'Outdated movement state or inactive actor'; END IF;
 IF p_path IS NULL OR jsonb_typeof(p_path)<>'array' THEN RAISE EXCEPTION 'Movement path must be an array'; END IF;
 v_step_count:=jsonb_array_length(p_path);
 IF v_step_count<1 OR v_step_count>160 THEN RAISE EXCEPTION 'Invalid movement path length'; END IF;
 v_q_before:=v_actor.q;v_r_before:=v_actor.r;v_remaining:=v_actor.movement_remaining;
 v_flight:=coalesce(v_actor.flying,false) OR EXISTS(
  SELECT 1 FROM public.combatant_effects e JOIN public.rule_effects d ON d.id=e.effect_id
  WHERE e.combat_id=v_actor.combat_id AND e.combatant_id=p_combatant_id
   AND e.status='active' AND e.applied_round<=v_actor.current_round
   AND (e.expires_round IS NULL OR e.expires_round>=v_actor.current_round)
   AND (e.expires_at IS NULL OR e.expires_at>now())
   AND d.active AND d.modifiers->>'type'='flight'
   AND d.modifiers->>'ignore_terrain'='true'
 );
 FOR v_step IN SELECT value FROM jsonb_array_elements(p_path)
 LOOP
  IF jsonb_typeof(v_step)<>'object' OR coalesce(v_step->>'q','') !~ '^[-]?[0-9]{1,6}$'
    OR coalesce(v_step->>'r','') !~ '^[-]?[0-9]{1,6}$' THEN
   RAISE EXCEPTION 'Invalid hex step';
  END IF;
  v_q:=(v_step->>'q')::integer;v_r:=(v_step->>'r')::integer;
  IF (abs(v_q-v_q_before)+abs(v_r-v_r_before)+abs(v_q-v_q_before+v_r-v_r_before))<>2 THEN
   RAISE EXCEPTION 'Movement path contains a nonadjacent hex';
  END IF;
  SELECT movement_mode,notes INTO v_terrain,v_notes
  FROM public.combat_hexes WHERE combat_id=v_actor.combat_id AND q=v_q AND r=v_r;
  IF coalesce(v_notes,'') ~* '(^|[[:space:],;|])(wall|vägg|mur)($|[[:space:],;|])' THEN
   RAISE EXCEPTION 'A wall blocks the movement path';
  END IF;
  SELECT coalesce(bool_or(d.modifiers->>'movement_mode'='difficult'),false),
   coalesce(bool_or(d.modifiers->>'movement_mode'='blocked'),false)
  INTO v_area_difficult,v_area_blocked
  FROM public.combat_area_effects a JOIN public.rule_effects d ON d.id=a.effect_id
  WHERE a.combat_id=v_actor.combat_id AND a.status='active' AND d.active
   AND a.applied_round<=v_actor.current_round
   AND (a.expires_round IS NULL OR a.expires_round>=v_actor.current_round)
   AND d.modifiers->>'type'='area_terrain'
   AND (abs(v_q-a.center_q)+abs(v_r-a.center_r)+abs(v_q-a.center_q+v_r-a.center_r))/2<=a.radius;
  IF NOT v_flight AND (v_terrain='blocked' OR v_area_blocked) THEN
   RAISE EXCEPTION 'Impassable terrain in the movement path';
  END IF;
  IF v_index=v_step_count-1 AND EXISTS(
    SELECT 1 FROM public.combatants c WHERE c.combat_id=v_actor.combat_id
    AND c.id<>p_combatant_id AND c.q=v_q AND c.r=v_r AND c.status<>'removed'
  ) THEN RAISE EXCEPTION 'Destination hex is occupied'; END IF;
  FOR v_cond IN
   SELECT d.modifiers->>'type' AS kind,source.q AS source_q,source.r AS source_r
   FROM public.combatant_effects e JOIN public.rule_effects d ON d.id=e.effect_id
   JOIN public.combatants source ON source.id=e.source_combatant_id AND source.combat_id=e.combat_id
   WHERE e.combat_id=v_actor.combat_id AND e.combatant_id=p_combatant_id
    AND e.status='active' AND e.applied_round<=v_actor.current_round
    AND (e.expires_round IS NULL OR e.expires_round>=v_actor.current_round)
    AND (e.expires_at IS NULL OR e.expires_at>now())
    AND d.active AND d.modifiers->>'type' IN ('fear','panic')
  LOOP
   v_old_distance:=(abs(v_q_before-v_cond.source_q)+abs(v_r_before-v_cond.source_r)
     +abs(v_q_before-v_cond.source_q+v_r_before-v_cond.source_r))/2;
   v_new_distance:=(abs(v_q-v_cond.source_q)+abs(v_r-v_cond.source_r)
     +abs(v_q-v_cond.source_q+v_r-v_cond.source_r))/2;
   IF (v_cond.kind='fear' AND v_new_distance<v_old_distance)
     OR (v_cond.kind='panic' AND v_new_distance<=v_old_distance) THEN
    RAISE EXCEPTION 'Fear or panic restricts movement towards the source';
   END IF;
  END LOOP;
  v_cost:=CASE WHEN v_flight THEN 1 WHEN
   EXISTS(
    SELECT 1 FROM public.alea_footprint_cells(v_q,v_r,
      public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot),
      coalesce((v_actor.state->'footprint'->>'facing')::integer,0)) fp
    LEFT JOIN public.combat_hexes tile ON tile.combat_id=v_actor.combat_id AND tile.q=fp.q AND tile.r=fp.r
    WHERE tile.movement_mode='difficult' OR EXISTS(
     SELECT 1 FROM public.combat_area_effects a
     JOIN public.rule_effects d ON d.id=a.effect_id
     WHERE a.combat_id=v_actor.combat_id AND a.status='active' AND d.active
     AND d.modifiers->>'type'='area_terrain'
     AND d.modifiers->>'movement_mode'='difficult'
     AND a.applied_round<=v_actor.current_round
     AND (a.expires_round IS NULL OR a.expires_round>=v_actor.current_round)
     AND (abs(fp.q-a.center_q)+abs(fp.r-a.center_r)+abs(fp.q-a.center_q+fp.r-a.center_r))/2<=a.radius
    )
   ) THEN 2 ELSE 1 END;
  IF v_remaining<v_cost THEN RAISE EXCEPTION 'Not enough remaining movement'; END IF;
  v_remaining:=v_remaining-v_cost;v_spent:=v_spent+v_cost;
  UPDATE public.combatants SET q=v_q,r=v_r,movement_remaining=v_remaining,updated_at=now()
  WHERE id=p_combatant_id;
  -- Crossing an area may defeat a character; stop instead of moving a dead unit.
  SELECT status,current_kp INTO v_status,v_current_kp FROM public.combatants WHERE id=p_combatant_id;
  v_q_before:=v_q;v_r_before:=v_r;v_index:=v_index+1;
  IF v_status IN ('dead','removed','defeated') THEN EXIT; END IF;
 END LOOP;
 RETURN jsonb_build_object('id',p_combatant_id,'q',v_q_before,'r',v_r_before,
  'movement_remaining',v_remaining,'spent',v_spent,'status',v_status,
  'current_kp',v_current_kp,'interrupted',v_index<v_step_count);
END $_$;


ALTER FUNCTION "public"."haj_move_combatant"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."haj_restore_combatant"("p_combatant_id" "uuid", "p_snapshot" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE v_campaign uuid;v_id uuid;v_combat uuid;
BEGIN
 SELECT campaign_id,combat_id INTO v_campaign,v_combat FROM public.combatants WHERE id=p_combatant_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missing combatant'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_campaign)) THEN RAISE EXCEPTION 'Only the GM can undo combat'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object'
   OR coalesce(p_snapshot->>'id','')<>p_combatant_id::text
   OR p_snapshot->>'q' IS NULL OR p_snapshot->>'r' IS NULL
   OR p_snapshot->>'q' !~ '^[-]?[0-9]{1,6}$'
   OR p_snapshot->>'r' !~ '^[-]?[0-9]{1,6}$'
 THEN RAISE EXCEPTION 'Invalid undo snapshot'; END IF;
 PERFORM set_config('alea.haj_restore','on',true);
 UPDATE public.combatants SET
  q=(p_snapshot->>'q')::integer,r=(p_snapshot->>'r')::integer,
  flying=coalesce((p_snapshot->>'flying')::boolean,false),
  visible_to_players=coalesce((p_snapshot->>'visible_to_players')::boolean,true),
  current_kp=CASE WHEN p_snapshot->>'current_kp' IS NULL THEN NULL ELSE (p_snapshot->>'current_kp')::integer END,
  current_psy=CASE WHEN p_snapshot->>'current_psy' IS NULL THEN NULL ELSE (p_snapshot->>'current_psy')::integer END,
  movement_remaining=(p_snapshot->>'movement_remaining')::numeric,
  status=coalesce(p_snapshot->>'status','active'),
  action_plan=coalesce(p_snapshot->'action_plan','[]'::jsonb),
  state=coalesce(p_snapshot->'state','{}'::jsonb),updated_at=now()
 WHERE id=p_combatant_id;
 RETURN jsonb_build_object('restored',true,'combatant_id',p_combatant_id);
END $_$;


ALTER FUNCTION "public"."haj_restore_combatant"("p_combatant_id" "uuid", "p_snapshot" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin

    insert into public.profiles (
        id,
        display_name,
        email
    )
    values (
        new.id,

        coalesce(
            new.raw_user_meta_data ->> 'full_name',
            new.raw_user_meta_data ->> 'name',
            split_part(new.email, '@', 1)
        ),

        new.email
    )
    on conflict (id) do nothing;

    return new;

end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_archive_intent"("job_id" "uuid", "token" "uuid", "drive_id" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare chosen text;
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 if drive_id is null or drive_id !~ '^[A-Za-z0-9_-]{10,200}$' then raise exception 'INVALID_DRIVE_ID'; end if;
 update public.hermes_alea_jobs set archive_drive_id=coalesce(archive_drive_id,drive_id)
 where id=job_id and lease_token=token and lease_until>now() and archive_state='processing'
 returning archive_drive_id into chosen;
 if not found then raise exception 'STALE_LEASE'; end if;
 return chosen;
end $_$;


ALTER FUNCTION "public"."hermes_alea_archive_intent"("job_id" "uuid", "token" "uuid", "drive_id" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_archive_result"("job_id" "uuid", "token" "uuid", "drive_id" "text" DEFAULT NULL::"text", "failure" "text" DEFAULT NULL::"text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."hermes_alea_archive_result"("job_id" "uuid", "token" "uuid", "drive_id" "text", "failure" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_begin"("request" "jsonb") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.hermes_alea_begin(request) $$;


ALTER FUNCTION "public"."hermes_alea_begin"("request" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_capabilities"() RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$
 select private.hermes_alea_capabilities()
$$;


ALTER FUNCTION "public"."hermes_alea_capabilities"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."hermes_alea_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    "target_kind" "text" NOT NULL,
    "target_id" "uuid" NOT NULL,
    "operation" "text" NOT NULL,
    "expected_revision" bigint NOT NULL,
    "state" "text" DEFAULT 'uploading'::"text" NOT NULL,
    "previous_key" "text",
    "result_revision" bigint,
    "source_path" "text",
    "output_path" "text",
    "source_mime" "text",
    "source_bytes" integer,
    "output_bytes" integer,
    "source_sha256" "text",
    "output_sha256" "text",
    "verified_at" timestamp with time zone,
    "width" integer,
    "height" integer,
    "alpha_preserved" boolean,
    "archive_state" "text" DEFAULT 'not_required'::"text" NOT NULL,
    "archive_drive_id" "text",
    "archive_verified_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp with time zone,
    "lease_token" "uuid",
    "lease_until" timestamp with time zone,
    "error_code" "text",
    "detached_at" timestamp with time zone,
    "source_deleted_at" timestamp with time zone,
    "output_delete_reserved_at" timestamp with time zone,
    "output_deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "source_delete_reserved_at" timestamp with time zone,
    CONSTRAINT "hermes_alea_jobs_archive_state_check" CHECK (("archive_state" = ANY (ARRAY['not_required'::"text", 'queued'::"text", 'processing'::"text", 'retry_wait'::"text", 'verified'::"text", 'needs_attention'::"text"]))),
    CONSTRAINT "hermes_alea_jobs_check" CHECK ((("operation" = 'REMOVE'::"text") OR (("source_path" IS NOT NULL) AND ("output_path" IS NOT NULL) AND ("source_mime" IS NOT NULL) AND ("source_bytes" IS NOT NULL) AND ("output_bytes" IS NOT NULL) AND ("source_sha256" IS NOT NULL) AND ("output_sha256" IS NOT NULL)))),
    CONSTRAINT "hermes_alea_jobs_check1" CHECK ((("source_path" IS NULL) OR ("source_path" = (((("requested_by")::"text" || '/'::"text") || ("id")::"text") || '/original'::"text")))),
    CONSTRAINT "hermes_alea_jobs_check2" CHECK ((("output_path" IS NULL) OR ("output_path" = (('trophy/'::"text" || ("id")::"text") || '.webp'::"text")))),
    CONSTRAINT "hermes_alea_jobs_expected_revision_check" CHECK (("expected_revision" >= 0)),
    CONSTRAINT "hermes_alea_jobs_height_check" CHECK ((("height" >= 1) AND ("height" <= 2048))),
    CONSTRAINT "hermes_alea_jobs_operation_check" CHECK (("operation" = ANY (ARRAY['CREATE'::"text", 'REPLACE'::"text", 'REMOVE'::"text"]))),
    CONSTRAINT "hermes_alea_jobs_output_bytes_check" CHECK ((("output_bytes" >= 1) AND ("output_bytes" <= 12000000))),
    CONSTRAINT "hermes_alea_jobs_output_sha256_check" CHECK (("output_sha256" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "hermes_alea_jobs_source_bytes_check" CHECK ((("source_bytes" >= 1) AND ("source_bytes" <= 12000000))),
    CONSTRAINT "hermes_alea_jobs_source_mime_check" CHECK (("source_mime" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/webp'::"text"]))),
    CONSTRAINT "hermes_alea_jobs_source_sha256_check" CHECK (("source_sha256" ~ '^[a-f0-9]{64}$'::"text")),
    CONSTRAINT "hermes_alea_jobs_state_check" CHECK (("state" = ANY (ARRAY['uploading'::"text", 'activated'::"text", 'removed'::"text", 'abandoned'::"text"]))),
    CONSTRAINT "hermes_alea_jobs_target_kind_check" CHECK (("target_kind" = ANY (ARRAY['definition'::"text", 'relief'::"text"]))),
    CONSTRAINT "hermes_alea_jobs_width_check" CHECK ((("width" >= 1) AND ("width" <= 2048)))
);


ALTER TABLE "public"."hermes_alea_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_claim"("batch_size" integer DEFAULT 3) RETURNS SETOF "public"."hermes_alea_jobs"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."hermes_alea_claim"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_cleanup"("job_id" "uuid", "kind" "text", "action" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."hermes_alea_cleanup"("job_id" "uuid", "kind" "text", "action" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_finalize"("job_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql"
    SET "search_path" TO ''
    AS $$ select private.hermes_alea_finalize(job_id) $$;


ALTER FUNCTION "public"."hermes_alea_finalize"("job_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_health"() RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
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


ALTER FUNCTION "public"."hermes_alea_health"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_inventory"("page_offset" integer DEFAULT 0) RETURNS TABLE("bucket" "text", "path" "text", "job_id" "uuid")
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if current_user<>'service_role' then raise exception 'FORBIDDEN'; end if;
 return query select o.bucket_id,o.name,j.id from storage.objects o
 left join public.hermes_alea_jobs j on
 (o.bucket_id='hermes-alea-originals' and o.name=j.source_path) or (o.bucket_id='hermes-alea-display' and o.name=j.output_path)
 where o.bucket_id in ('hermes-alea-originals','hermes-alea-display')
 order by o.bucket_id,o.name limit 500 offset greatest(page_offset,0);
end $$;


ALTER FUNCTION "public"."hermes_alea_inventory"("page_offset" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_remove"("request" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare j jsonb;
begin
 if request->>'operation' is distinct from 'REMOVE' then raise exception 'BAD_OPERATION'; end if;
 j:=private.hermes_alea_begin(request);
 return private.hermes_alea_finalize((j->>'id')::uuid);
end $$;


ALTER FUNCTION "public"."hermes_alea_remove"("request" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_alea_verify"("job_id" "uuid", "receipt" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if current_user <> 'service_role' then raise exception 'FORBIDDEN' using errcode='42501'; end if;
 update public.hermes_alea_jobs set verified_at=now(),width=(receipt->>'width')::integer,
 height=(receipt->>'height')::integer,alpha_preserved=(receipt->>'alpha_preserved')::boolean
 where id=job_id and state='uploading' and source_sha256=receipt->>'source_sha256' and output_sha256=receipt->>'output_sha256'
 and source_bytes=(receipt->>'source_bytes')::integer and output_bytes=(receipt->>'output_bytes')::integer
 and receipt->>'source_mime'=source_mime;
 if not found then raise exception 'VERIFICATION_CONFLICT'; end if;
end $$;


ALTER FUNCTION "public"."hermes_alea_verify"("job_id" "uuid", "receipt" "jsonb") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hermes_web_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pose_id" "uuid",
    "asset_kind" "text" NOT NULL,
    "source_bucket" "text" DEFAULT 'alea-battle-pose-staging'::"text" NOT NULL,
    "source_path" "text" NOT NULL,
    "idempotency_key" "uuid" NOT NULL,
    "requested_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "state" "text" DEFAULT 'queued'::"text" NOT NULL,
    "archive_drive_file_id" "text",
    "output_path" "text",
    "source_sha256" "text",
    "error_code" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "race_pose_id" "uuid",
    CONSTRAINT "hermes_web_jobs_asset_kind_check" CHECK (((("pose_id" IS NOT NULL) AND ("asset_kind" = 'battle-pose-cutout'::"text")) OR (("race_pose_id" IS NOT NULL) AND ("asset_kind" = 'race-battle-pose-cutout'::"text")))),
    CONSTRAINT "hermes_web_jobs_attempts_check" CHECK ((("attempts" >= 0) AND ("attempts" <= 20))),
    CONSTRAINT "hermes_web_jobs_pose_owner_check" CHECK ((("pose_id" IS NOT NULL) <> ("race_pose_id" IS NOT NULL))),
    CONSTRAINT "hermes_web_jobs_source_bucket_check" CHECK (("source_bucket" = 'alea-battle-pose-staging'::"text")),
    CONSTRAINT "hermes_web_jobs_source_path_check" CHECK (((("pose_id" IS NOT NULL) AND ("source_path" ~ '^battle-pose/[a-z0-9_-]+/[0-9a-f-]{36}/[a-z0-9_]+/[0-9a-f-]{36}[.](png|webp)$'::"text")) OR (("race_pose_id" IS NOT NULL) AND ("source_path" ~ '^race-battle-pose/[a-z0-9_-]+/(male|female|neutral)/[a-z0-9_]+/[0-9a-f-]{36}[.](png|webp)$'::"text")))),
    CONSTRAINT "hermes_web_jobs_source_sha256_check" CHECK ((("source_sha256" IS NULL) OR ("source_sha256" ~ '^[a-f0-9]{64}$'::"text"))),
    CONSTRAINT "hermes_web_jobs_state_check" CHECK (("state" = ANY (ARRAY['queued'::"text", 'archiving'::"text", 'archived'::"text", 'optimizing'::"text", 'publishing'::"text", 'published'::"text", 'failed'::"text", 'quarantined'::"text"])))
);


ALTER TABLE "public"."hermes_web_jobs" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_claim_web_jobs"("batch_size" integer DEFAULT 3) RETURNS SETOF "public"."hermes_web_jobs"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$ begin return query with picked as (select id from public.hermes_web_jobs where (state='queued' or (state in ('archiving','archived','optimizing','publishing') and updated_at < now()-interval '45 minutes')) and attempts<5 order by created_at for update skip locked limit least(greatest(batch_size,1),5)) update public.hermes_web_jobs j set state='archiving',attempts=j.attempts+1,updated_at=now(),error_code=null from picked where j.id=picked.id returning j.*; end $$;


ALTER FUNCTION "public"."hermes_claim_web_jobs"("batch_size" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_core_system_image_create"("p_asset_key" "text", "p_label" "text", "p_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare m jsonb; a public.arcane_system_assets;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 if p_asset_key !~ '^[a-z0-9][a-z0-9_-]*$'
    or nullif(btrim(p_label),'') is null
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_path is distinct from ('hermes/system-asset/'||p_asset_key||'/'||p_sha256||'.webp')
    or p_bytes not between 1 and 12000000
    or p_width not between 1 and 2048 or p_height not between 1 and 2048
    or p_alpha_preserved is null
 then raise exception 'INVALID_IMAGE_METADATA'; end if;
 select metadata into m from storage.objects
  where bucket_id='alea-hermes-public' and name=p_path;
 if m is null or m->>'mimetype' is distinct from 'image/webp'
    or coalesce((m->>'size')::bigint,-1)<>p_bytes
 then raise exception 'UPLOAD_NOT_VERIFIED'; end if;
 insert into public.arcane_system_assets
 (id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved,image_revision)
 values(gen_random_uuid(),p_asset_key,p_label,p_path,p_sha256,p_bytes,p_width,p_height,p_alpha_preserved,1)
 on conflict(asset_key) do nothing returning * into a;
 if not found then raise exception 'SYSTEM_ASSET_ALREADY_EXISTS'; end if;
 return jsonb_build_object('key',a.asset_path,'revision',a.image_revision,'asset_key',a.asset_key);
end $_$;


ALTER FUNCTION "public"."hermes_core_system_image_create"("p_asset_key" "text", "p_label" "text", "p_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_core_system_image_read"("p_asset_key" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare a public.arcane_system_assets;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 select * into a from public.arcane_system_assets where asset_key=p_asset_key;
 if not found then raise exception 'UNKNOWN_SYSTEM_ASSET'; end if;
 return jsonb_build_object('key',a.asset_path,'revision',a.image_revision);
end $$;


ALTER FUNCTION "public"."hermes_core_system_image_read"("p_asset_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."hermes_core_system_image_set"("p_asset_key" "text", "p_expected_revision" bigint, "p_expected_path" "text", "p_new_path" "text", "p_sha256" "text" DEFAULT NULL::"text", "p_bytes" integer DEFAULT NULL::integer, "p_width" integer DEFAULT NULL::integer, "p_height" integer DEFAULT NULL::integer, "p_alpha_preserved" boolean DEFAULT NULL::boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
declare a public.arcane_system_assets; m jsonb;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 select * into a from public.arcane_system_assets where asset_key=p_asset_key for update;
 if not found then raise exception 'UNKNOWN_SYSTEM_ASSET'; end if;
 if a.image_revision<>p_expected_revision or a.asset_path is distinct from p_expected_path then
  raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001';
 end if;
 if p_new_path is not null then
  if p_new_path !~ ('^hermes/system-asset/' || p_asset_key || '/[a-f0-9]{64}[.]webp$') then raise exception 'INVALID_IMAGE_PATH'; end if;
  select metadata into m from storage.objects
   where bucket_id='alea-hermes-public' and name=p_new_path;
  if m is null or m->>'mimetype' is distinct from 'image/webp'
    or p_bytes is null or p_bytes<1 or p_bytes>12000000
    or coalesce((m->>'size')::bigint,-1)<>p_bytes
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_width is null or p_width not between 1 and 2048
    or p_height is null or p_height not between 1 and 2048
    or p_alpha_preserved is null
   then raise exception 'IMAGE_METADATA_MISMATCH'; end if;
 end if;
 update public.arcane_system_assets
 set asset_path=p_new_path, app_sha256=case when p_new_path is null then null else p_sha256 end,
 app_bytes=case when p_new_path is null then null else p_bytes end,
 width=case when p_new_path is null then null else p_width end,
 height=case when p_new_path is null then null else p_height end,
 alpha_preserved=case when p_new_path is null then null else p_alpha_preserved end,
 image_revision=image_revision+1
 where id=a.id returning * into a;
 return jsonb_build_object('key',a.asset_path,'revision',a.image_revision);
end $_$;


ALTER FUNCTION "public"."hermes_core_system_image_set"("p_asset_key" "text", "p_expected_revision" bigint, "p_expected_path" "text", "p_new_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_campaign_day_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
begin
  insert into public.campaign_day_state
    (campaign_id, day_number, weather, with_rest, erf_cycle, erf_enabled, started_at, updated_at)
  values
    (new.id, 1, '', true, 1, true, now(), now())
  on conflict (campaign_id) do nothing;

  insert into public.campaign_day_history
    (campaign_id, day_number, weather, with_rest, erf_cycle, started_at)
  values
    (new.id, 1, '', true, 1, now())
  on conflict (campaign_id, day_number) do nothing;

  return new;
end
$$;


ALTER FUNCTION "public"."init_campaign_day_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."init_character_rest_state"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_day integer;
  v_cycle integer;
  v_rest numeric(5,2);
begin
  select day_number,erf_cycle,rest_hours
  into v_day,v_cycle,v_rest
  from public.campaign_day_state
  where campaign_id=new.campaign_id;

  insert into public.character_rest_state
    (character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
  values
    (new.id,new.campaign_id,coalesce(v_cycle,1),coalesce(v_day,1),coalesce(v_rest,0),coalesce(v_day,1),now())
  on conflict (character_id) do nothing;

  return new;
end
$$;


ALTER FUNCTION "public"."init_character_rest_state"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."material_storage_path_valid"("p_name" "text") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $_$
 select coalesce(
  p_name ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([a-zA-Z0-9][a-zA-Z0-9._-]{0,119})$'
   and p_name not like '%..%'
   and p_name not like '%//%',
  false)
$_$;


ALTER FUNCTION "public"."material_storage_path_valid"("p_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_shared_material_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if exists (select 1 from public.campaign_material_shares s
            where s.material_id=old.id)
    or exists (select 1 from public.campaign_material_presentations p
               where p.material_id=old.id) then
   raise exception 'Cannot delete material with presentation or share history';
 end if;
 return old;
end;
$$;


ALTER FUNCTION "public"."prevent_shared_material_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_magic_property_kind"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
 if new.kind is distinct from old.kind and exists(
  select 1 from public.rule_magic_artifact_powers p where p.property_id=old.id
 ) then
  raise exception 'Egenskapstypen kan inte ändras när artefakter använder den';
 end if;
 return new;
end $$;


ALTER FUNCTION "public"."protect_magic_property_kind"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reset_campaign_time_on_new_day"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  if new.day_number is distinct from old.day_number then
    new.time_of_day := 'morning';
  end if;
  return new;
end
$$;


ALTER FUNCTION "public"."reset_campaign_time_on_new_day"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_combat_area_stay"("p_combatant_id" "uuid", "p_round" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
DECLARE v_actor record; v_area record; v_result jsonb; v_events jsonb:='[]'::jsonb;
BEGIN
 SELECT c.*,i.round_number AS current_round,i.status AS combat_status,
  i.phase AS combat_phase,i.active_actor_id AS current_actor
 INTO v_actor
 FROM public.combatants c JOIN public.combat_instances i ON i.id=c.combat_id
 WHERE c.id=p_combatant_id FOR UPDATE OF c;
 IF NOT FOUND THEN RAISE EXCEPTION 'Combatant not found'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_actor.campaign_id)) THEN
  RAISE EXCEPTION 'Only the GM can resolve area effects';
 END IF;
 IF v_actor.combat_status<>'active' OR v_actor.combat_phase<>'movement'
    OR v_actor.current_actor IS DISTINCT FROM p_combatant_id
    OR v_actor.current_round<>p_round THEN
  RAISE EXCEPTION 'Area stay can only resolve on the current active turn';
 END IF;
 FOR v_area IN
  SELECT a.id FROM public.combat_area_effects a
  JOIN public.rule_effects d ON d.id=a.effect_id AND d.active
  WHERE a.combat_id=v_actor.combat_id AND a.status='active'
    AND a.applied_round<=p_round AND (a.expires_round IS NULL OR a.expires_round>=p_round)
    AND d.target_type IN ('hex','area')
    AND EXISTS(
     SELECT 1 FROM public.alea_footprint_cells(v_actor.q,v_actor.r,
      public.alea_footprint_shape(v_actor.state,v_actor.name_snapshot),
      coalesce((v_actor.state->'footprint'->>'facing')::integer,0)) fp
     WHERE (abs(fp.q-a.center_q)+abs(fp.r-a.center_r)+
      abs(fp.q-a.center_q+fp.r-a.center_r))/2<=a.radius
    )
  ORDER BY a.id
 LOOP
  v_result:=private.haj_area_event(v_area.id,p_combatant_id,p_round,'stay');
  v_events:=v_events||jsonb_build_array(jsonb_build_object('area_id',v_area.id,'result',v_result));
 END LOOP;
 RETURN v_events;
END $$;


ALTER FUNCTION "public"."resolve_combat_area_stay"("p_combatant_id" "uuid", "p_round" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."resolve_combat_dot"("p_effect_id" "uuid", "p_round" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE
 v_effect record;
 v_protect record;
 v_def record;
 v_kind text;
 v_raw text;
 v_base integer;
 v_protection integer := 0;
 v_net integer;
 v_before integer;
 v_after integer;
 v_prev integer;
 v_source_name text;
BEGIN
 IF p_round IS NULL OR p_round < 1 THEN
  RAISE EXCEPTION 'Ogiltig stridsrunda.';
 END IF;
 SELECT e.*, c.current_kp AS target_kp,c.status AS target_status,c.name_snapshot AS target_name,
        i.round_number AS instance_round,i.active_actor_id AS instance_actor,
        i.status AS instance_status,i.phase AS instance_phase
 INTO v_effect
 FROM public.combatant_effects e
 JOIN public.combatants c ON c.id=e.combatant_id AND c.combat_id=e.combat_id
 JOIN public.combat_instances i ON i.id=e.combat_id AND i.campaign_id=e.campaign_id
 WHERE e.id=p_effect_id
 FOR UPDATE OF e,c,i;
 IF NOT FOUND THEN RAISE EXCEPTION 'Effekten finns inte i denna strid.'; END IF;
 IF NOT (private.is_admin() OR private.is_campaign_gm(v_effect.campaign_id)) THEN
  RAISE EXCEPTION 'Endast SL får verkställa fortlöpande skada.';
 END IF;
 IF v_effect.instance_round<>p_round OR v_effect.instance_actor IS DISTINCT FROM v_effect.combatant_id
    OR v_effect.instance_status<>'active' OR v_effect.instance_phase<>'movement' THEN
  RAISE EXCEPTION 'Skadan kan bara behandlas på den drabbades aktiva drag.';
 END IF;
 SELECT * INTO v_def FROM public.rule_effects WHERE id=v_effect.effect_id;
 IF NOT FOUND OR NOT v_def.active OR v_def.modifiers->>'type'<>'damage_over_time' THEN
  RAISE EXCEPTION 'Effekten ger inte fortlöpande skada.';
 END IF;
 v_kind := v_def.modifiers->>'damage_kind';
 IF v_kind NOT IN ('poison','fire','physical','magic') THEN
  RAISE EXCEPTION 'Effekten saknar giltig skadetyp.';
 END IF;
 IF v_effect.status<>'active' OR v_effect.applied_round>p_round
    OR (v_effect.expires_round IS NOT NULL AND v_effect.expires_round<p_round)
    OR (v_effect.expires_at IS NOT NULL AND v_effect.expires_at<=now()) THEN
  RETURN jsonb_build_object('applied',false,'reason','expired');
 END IF;
 v_raw:=v_effect.parameters->>'last_tick_round';
 IF v_raw ~ '^[0-9]{1,8}$' AND v_raw::integer>=p_round THEN
  RETURN jsonb_build_object('applied',false,'reason','already_resolved');
 END IF;
 IF v_effect.target_kp IS NULL OR v_effect.target_status IN ('dead','removed','defeated') THEN
  RETURN jsonb_build_object('applied',false,'reason','not_damageable');
 END IF;
 v_raw:=v_effect.parameters->>'damage_per_round';
 IF v_raw IS NULL OR v_raw !~ '^[0-9]{1,4}$' OR v_raw::integer<1 THEN
  RAISE EXCEPTION 'Effektens skada per SR måste vara ett positivt heltal.';
 END IF;
 v_base:=v_raw::integer;
 FOR v_protect IN
  SELECT p.parameters,d.modifiers
  FROM public.combatant_effects p
  JOIN public.rule_effects d ON d.id=p.effect_id
  WHERE p.combat_id=v_effect.combat_id AND p.combatant_id=v_effect.combatant_id
    AND p.status='active' AND p.applied_round<=p_round
    AND (p.expires_round IS NULL OR p.expires_round>=p_round)
    AND (p.expires_at IS NULL OR p.expires_at>now())
    AND d.active AND d.modifiers->>'type'='protection'
    AND d.modifiers->>'damage_kind' IN ('all',v_kind)
 LOOP
  v_raw:=v_protect.parameters->>'protection_points';
  IF v_raw ~ '^[0-9]{1,4}$' THEN
   v_protection:=greatest(v_protection,v_raw::integer);
  END IF;
 END LOOP;
 v_net:=greatest(0,v_base-v_protection);
 v_before:=v_effect.target_kp;
 v_after:=greatest(0,v_before-v_net);
 UPDATE public.combatants SET current_kp=v_after,
   status=CASE WHEN v_after=0 THEN 'dead' ELSE status END,
   updated_at=now()
 WHERE id=v_effect.combatant_id;
 UPDATE public.combatant_effects
 SET parameters=jsonb_set(coalesce(parameters,'{}'::jsonb),'{last_tick_round}',to_jsonb(p_round)),
     updated_at=now()
 WHERE id=p_effect_id;
 SELECT name_snapshot INTO v_source_name FROM public.combatants
 WHERE id=v_effect.source_combatant_id AND combat_id=v_effect.combat_id;
 INSERT INTO public.combat_log
 (combat_id,campaign_id,round_number,phase,actor_id,target_id,event_type,message,details,player_visible)
 VALUES
 (v_effect.combat_id,v_effect.campaign_id,p_round,'damage',v_effect.source_combatant_id,v_effect.combatant_id,
  'effect_tick',v_effect.target_name||' drabbas av '||v_def.name||': '||v_base||' KP - skydd '||v_protection||' = '||v_net||' KP ('
   ||v_before||' → '||v_after||')',
  jsonb_build_object('effect_id',p_effect_id,'effect',v_def.code,'kind',v_kind,'gross',v_base,
    'protection',v_protection,'net',v_net,'kp_before',v_before,'kp_after',v_after,
    'round',p_round,'source',v_source_name),true);
 RETURN jsonb_build_object('applied',true,'gross',v_base,'protection',v_protection,'net',v_net,
   'kp_before',v_before,'kp_after',v_after,'defeated',v_after=0,'round',p_round);
END;
$_$;


ALTER FUNCTION "public"."resolve_combat_dot"("p_effect_id" "uuid", "p_round" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reveal_campaign_map"("p_map_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_campaign_id uuid;
begin
  select m.campaign_id
    into v_campaign_id
  from public.campaign_maps m
  where m.id = p_map_id;

  if v_campaign_id is null then
    raise exception 'Kartan finns inte.';
  end if;

  if not (
    private.is_admin()
    or private.is_campaign_gm(v_campaign_id)
  ) then
    raise exception 'Du har inte behörighet att låsa upp kartan.';
  end if;

  update public.campaign_maps
  set
    fully_revealed = false,
    player_visible = true,
    first_activated_at = coalesce(first_activated_at, now()),
    last_activated_at = now(),
    updated_at = now()
  where id = p_map_id;

  insert into public.campaign_location_state (
    location_id,
    campaign_id,
    status,
    updated_by,
    updated_at
  )
  select distinct
    a.location_id,
    v_campaign_id,
    'explored',
    auth.uid(),
    now()
  from public.campaign_map_areas a
  join public.campaign_locations l
    on l.id = a.location_id
   and l.campaign_id = v_campaign_id
  where a.map_id = p_map_id
    and a.location_id is not null
  on conflict (location_id)
  do update set
    campaign_id = excluded.campaign_id,
    status = 'explored',
    updated_by = auth.uid(),
    updated_at = now();

  return p_map_id;
end;
$$;


ALTER FUNCTION "public"."reveal_campaign_map"("p_map_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rule_strength_group"("p_strength" numeric) RETURNS integer
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
  select case
    when p_strength is null or p_strength < 0 then null
    when p_strength <= 3 then 0
    when p_strength <= 8 then 1
    when p_strength <= 12 then 2
    when p_strength <= 16 then 3
    when p_strength <= 20 then 4
    when p_strength <= 25 then 5
    when p_strength <= 30 then 6
    when p_strength <= 40 then 7
    when p_strength <= 50 then 8
    when p_strength <= 60 then 9
    when p_strength <= 70 then 10
    when p_strength <= 80 then 11
    when p_strength <= 90 then 12
    when p_strength <= 100 then 13
    when p_strength <= 110 then 14
    when p_strength <= 120 then 15
    when p_strength <= 130 then 16
    when p_strength <= 140 then 17
    when p_strength <= 150 then 18
    when p_strength <= 160 then 19
    when p_strength <= 170 then 20
    when p_strength <= 180 then 21
    when p_strength <= 190 then 22
    when p_strength <= 200 then 23
    when p_strength <= 210 then 24
    when p_strength <= 220 then 25
    when p_strength <= 230 then 26
    when p_strength <= 240 then 27
    when p_strength <= 250 then 28
    when p_strength <= 260 then 29
    when p_strength <= 270 then 30
    when p_strength <= 280 then 31
    when p_strength <= 290 then 32
    when p_strength <= 300 then 33
    else 33 + ceil((p_strength - 300) / 10.0)::integer
  end
$$;


ALTER FUNCTION "public"."rule_strength_group"("p_strength" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rule_weapon_grip"("p_handling" "text", "p_weapon_strength_group" integer, "p_character_strength_group" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" IMMUTABLE
    SET "search_path" TO ''
    AS $$
declare
  v_required integer := p_weapon_strength_group;
  v_hands integer;
  v_gl_multiplier numeric := 1.0;
  v_status text := 'normal';
  v_can_use boolean := true;
begin
  if p_handling not in ('1H','1-2H','2H')
     or v_required is null
     or p_character_strength_group is null then
    return jsonb_build_object(
      'can_use', false,
      'hands', null,
      'gl_multiplier', 0,
      'status', 'invalid'
    );
  end if;

  if p_handling = '1H' then
    v_hands := 1;
    if p_character_strength_group >= v_required then
      null;
    elsif p_character_strength_group = v_required - 1 then
      v_gl_multiplier := 0.5;
      v_status := 'understrength';
    else
      v_can_use := false;
      v_gl_multiplier := 0;
      v_status := 'too_weak';
    end if;

  elsif p_handling = '2H' then
    v_hands := 2;
    if p_character_strength_group >= v_required then
      null;
    elsif p_character_strength_group = v_required - 1 then
      v_gl_multiplier := 0.5;
      v_status := 'understrength';
    else
      v_can_use := false;
      v_gl_multiplier := 0;
      v_status := 'too_weak';
    end if;

  else
    -- 1–2H: STY-gruppen avgör fattningen.
    -- En grupp över vapnets krav => 1 hand.
    -- Vapnets angivna grupp => 2 händer.
    -- Exakt en grupp under => 2 händer, men GL halveras.
    if p_character_strength_group >= v_required + 1 then
      v_hands := 1;
    elsif p_character_strength_group = v_required then
      v_hands := 2;
    elsif p_character_strength_group = v_required - 1 then
      v_hands := 2;
      v_gl_multiplier := 0.5;
      v_status := 'understrength';
    else
      v_hands := 2;
      v_can_use := false;
      v_gl_multiplier := 0;
      v_status := 'too_weak';
    end if;
  end if;

  return jsonb_build_object(
    'can_use', v_can_use,
    'hands', v_hands,
    'gl_multiplier', v_gl_multiplier,
    'status', v_status
  );
end
$$;


ALTER FUNCTION "public"."rule_weapon_grip"("p_handling" "text", "p_weapon_strength_group" integer, "p_character_strength_group" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sam_guard_material_share"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare v_exists boolean;
begin
 if new.revoked_at is null then
   select true into v_exists from public.campaign_materials m
   where m.campaign_id=new.campaign_id and m.id=new.material_id and m.archived_at is null
   for share;
   if not coalesce(v_exists,false) then
     raise exception 'Cannot share archived or foreign-campaign material' using errcode='23514';
   end if;
 end if;
 return new;
end;
$$;


ALTER FUNCTION "public"."sam_guard_material_share"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sam_set_material_share"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_shared" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
 v_found boolean;
 v_changed integer := 0;
begin
 if p_campaign_id is null or p_material_id is null or p_shared is null then
   raise exception 'Campaign, material and share state are required' using errcode='22023';
 end if;
 if not (select private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
   raise exception 'Only the campaign GM may share player material' using errcode='42501';
 end if;
 if p_shared then
   -- Locks the material against concurrent archiving.
   select true into v_found from public.campaign_materials m
   where m.id=p_material_id and m.campaign_id=p_campaign_id and m.archived_at is null
   for share;
   if not coalesce(v_found,false) then
     raise exception 'The material is archived or outside this campaign' using errcode='23514';
   end if;
   insert into public.campaign_material_shares(campaign_id,material_id,shared_by)
   values(p_campaign_id,p_material_id,(select auth.uid()))
   on conflict(campaign_id,material_id) where revoked_at is null do nothing;
   get diagnostics v_changed=row_count;
 else
   update public.campaign_material_shares
   set revoked_at=now()
   where campaign_id=p_campaign_id and material_id=p_material_id and revoked_at is null;
   get diagnostics v_changed=row_count;
 end if;
 return jsonb_build_object('campaign_id',p_campaign_id,'material_id',p_material_id,
  'shared',p_shared,'changed',v_changed);
end;
$$;


ALTER FUNCTION "public"."sam_set_material_share"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_shared" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."seed_rule_race_attribute_rows"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.rule_race_attributes (race_id, attribute_key, sort_order)
  values
    (new.id,'STY',10),
    (new.id,'FYS',20),
    (new.id,'STO',30),
    (new.id,'SMI',40),
    (new.id,'INT',50),
    (new.id,'PSY',60),
    (new.id,'KAR',70)
  on conflict (race_id,attribute_key) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."seed_rule_race_attribute_rows"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campaign_time_of_day"("p_campaign_id" "uuid", "p_time_of_day" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_state public.campaign_day_state%rowtype;
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att ändra tiden på dygnet.';
  end if;
  if p_time_of_day is null or p_time_of_day not in ('dawn','morning','midday','afternoon','evening','night') then
    raise exception 'Ogiltig tid på dygnet.';
  end if;
  update public.campaign_day_state
     set time_of_day=p_time_of_day, updated_by=auth.uid(), updated_at=now()
   where campaign_id=p_campaign_id
  returning * into v_state;
  if not found then
    raise exception 'Kampanjens dagstatus saknas.';
  end if;
  return to_jsonb(v_state);
end
$$;


ALTER FUNCTION "public"."set_campaign_time_of_day"("p_campaign_id" "uuid", "p_time_of_day" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_campaign_weather"("p_campaign_id" "uuid", "p_weather" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  v_state public.campaign_day_state%rowtype;
  v_weather text := coalesce(trim(p_weather), '');
begin
  if not (
    private.is_admin()
    or private.is_campaign_gm(p_campaign_id)
  ) then
    raise exception 'Du har inte behörighet att ändra vädret.';
  end if;

  update public.campaign_day_state
  set weather = v_weather, updated_by = auth.uid(), updated_at = now()
  where campaign_id = p_campaign_id
  returning * into v_state;

  if not found then
    raise exception 'Kampanjens dagstatus saknas.';
  end if;

  update public.campaign_day_history
  set weather = v_weather
  where campaign_id = p_campaign_id
    and day_number = v_state.day_number;

  return to_jsonb(v_state);
end
$$;


ALTER FUNCTION "public"."set_campaign_weather"("p_campaign_id" "uuid", "p_weather" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_map_polygon_shapes_atomic"("p_map_id" "uuid", "p_changes" "jsonb") RETURNS integer
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
 v_map public.campaign_maps%rowtype;
 v_row jsonb;
 v_id uuid;
 v_expected_type text;
 v_expected jsonb;
 v_points jsonb;
 v_count integer := 0;
 v_expected_count integer;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 100 then
  raise exception 'Invalid polygon batch';
 end if;
 select * into v_map from public.campaign_maps where id=p_map_id for update;
 if not found then raise exception 'Map not found or inaccessible' using errcode='42501'; end if;
 if not (private.is_admin() or private.is_campaign_gm(v_map.campaign_id)) then
  raise exception 'Game master permission required' using errcode='42501';
 end if;
 -- Require unique IDs to avoid replaying an individual row in one batch.
 select count(distinct (item->>'id')) into v_expected_count from jsonb_array_elements(p_changes) item;
 if v_expected_count <> jsonb_array_length(p_changes) then raise exception 'Duplicate or missing polygon IDs'; end if;
 -- Validate every expected shape before ANY write.
 for v_row in select value from jsonb_array_elements(p_changes)
 loop
  v_id := (v_row->>'id')::uuid;
  v_expected_type := v_row->>'before_type';
  v_expected := v_row->'before_data';
  v_points := v_row->'points';
  if v_expected_type not in ('polygon','rect') or v_expected is null or
     jsonb_typeof(v_points) is distinct from 'array' or jsonb_array_length(v_points) < 3 or jsonb_array_length(v_points) > 5000 then
   raise exception 'Invalid polygon change';
  end if;
  if exists(select 1 from jsonb_array_elements(v_points) p
   where jsonb_typeof(p.value) is distinct from 'array' or jsonb_array_length(p.value) <> 2 or
   jsonb_typeof(p.value->0) <> 'number' or jsonb_typeof(p.value->1) <> 'number') then
   raise exception 'Invalid point coordinates';
  end if;
  perform 1 from public.campaign_map_areas a
   where a.id=v_id and a.map_id=p_map_id and a.shape_type=v_expected_type and a.shape_data=v_expected
   for update;
  if not found then raise exception 'Polygon changed since editor opened; reload map';
  end if;
 end loop;
 for v_row in select value from jsonb_array_elements(p_changes)
 loop
  update public.campaign_map_areas
   set shape_type='polygon',shape_data=jsonb_build_object('points',v_row->'points'),updated_at=now()
   where id=(v_row->>'id')::uuid and map_id=p_map_id;
  if not found then raise exception 'Polygon save failed'; end if;
  v_count := v_count+1;
 end loop;
 return v_count;
end;
$$;


ALTER FUNCTION "public"."update_map_polygon_shapes_atomic"("p_map_id" "uuid", "p_changes" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_campaign_image_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
declare linked_campaign uuid;
begin
 case new.object_type
 when 'place' then select campaign_id into linked_campaign from public.campaign_locations where id=new.object_id;
 when 'person' then select campaign_id into linked_campaign from public.campaign_npcs where id=new.object_id;
 when 'enemy' then select campaign_id into linked_campaign from public.campaign_monsters where id=new.object_id;
 when 'event' then select campaign_id into linked_campaign from public.campaign_events where id=new.object_id;
 when 'item' then select campaign_id into linked_campaign from public.campaign_materials where id=new.object_id;
 end case;
 if linked_campaign is distinct from new.campaign_id then raise exception 'Image target must belong to same campaign'; end if;
 return new;
end $$;


ALTER FUNCTION "public"."validate_campaign_image_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_campaign_material_link"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare valid boolean;
begin
  case new.entity_type
    when 'location' then select exists(select 1 from public.campaign_locations v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'npc' then select exists(select 1 from public.campaign_npcs v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'monster' then select exists(select 1 from public.campaign_monsters v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'event' then select exists(select 1 from public.campaign_events v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    when 'combat_scene' then select exists(select 1 from public.campaign_combat_scenes v where v.id=new.entity_id and v.campaign_id=new.campaign_id) into valid;
    else valid := false;
  end case;
  if not coalesce(valid,false) then
    raise exception 'Material link target does not belong to the campaign' using errcode='23514';
  end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."validate_campaign_material_link"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."validate_magic_artifact_power"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $_$
declare power_kind text;
declare power_key text;
begin
 select d.kind,d.property_key into power_kind,power_key
 from public.rule_magic_property_definitions d where d.id=new.property_id;
 if power_kind is null then raise exception 'Magisk egenskap finns inte'; end if;
 if power_kind='spell' and power_key<>'magic_battery' and new.spell_id is null then
  raise exception 'Besvärjelseegenskap kräver registrerad besvärjelse';
 elsif power_kind<>'spell' and new.spell_id is not null then
  raise exception 'Endast besvärjelseegenskaper får länka besvärjelser';
 elsif power_key='magic_battery' and new.spell_id is not null then
  raise exception 'Magiskt batteri får besvärjelsen först vid laddning';
 end if;
 if power_key='magic_battery' and new.battery_grade_mode='dice' then
  if new.battery_grade_dice !~ '^[1-9][0-9]?T(3|4|6|8|10|12|20)([+-][0-9]{1,2})?$'
  then raise exception 'Ogiltig EG-tärning för magiskt batteri'; end if;
 end if;
 return new;
end $_$;


ALTER FUNCTION "public"."validate_magic_artifact_power"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "private"."hermes_alea_settings" (
    "singleton" boolean DEFAULT true NOT NULL,
    "enabled" boolean DEFAULT false NOT NULL,
    "max_pending" integer DEFAULT 5 NOT NULL,
    "max_user_bytes" bigint DEFAULT 60000000 NOT NULL,
    "max_total_bytes" bigint DEFAULT 1000000000 NOT NULL,
    "cleanup_enabled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "hermes_alea_settings_max_pending_check" CHECK ((("max_pending" >= 1) AND ("max_pending" <= 20))),
    CONSTRAINT "hermes_alea_settings_max_total_bytes_check" CHECK (("max_total_bytes" > 0)),
    CONSTRAINT "hermes_alea_settings_max_user_bytes_check" CHECK (("max_user_bytes" > 0)),
    CONSTRAINT "hermes_alea_settings_singleton_check" CHECK ("singleton")
);


ALTER TABLE "private"."hermes_alea_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."arcane_system_assets" (
    "id" "uuid" NOT NULL,
    "asset_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "asset_path" "text",
    "app_sha256" "text",
    "app_bytes" integer,
    "width" integer,
    "height" integer,
    "alpha_preserved" boolean,
    "image_revision" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "arcane_system_asset_publication" CHECK (((("asset_path" IS NULL) AND ("app_sha256" IS NULL) AND ("app_bytes" IS NULL) AND ("width" IS NULL) AND ("height" IS NULL) AND ("alpha_preserved" IS NULL)) OR (("asset_path" IS NOT NULL) AND ("app_sha256" ~ '^[a-f0-9]{64}$'::"text") AND (("app_bytes" >= 1) AND ("app_bytes" <= 500000)) AND (("width" >= 1) AND ("width" <= 4096)) AND (("height" >= 1) AND ("height" <= 4096)) AND (("alpha_preserved" IS TRUE) OR (("alpha_preserved" IS FALSE) AND (("asset_key" ~~ 'arcane-honor-relief-%'::"text") OR (("asset_key" = 'arcane-trophy-room-v2.2'::"text") AND ("width" = 1280) AND ("height" = 720))))) AND ("asset_path" = (((('hermes/system-asset/'::"text" || "asset_key") || '/'::"text") || "app_sha256") || '.webp'::"text"))))),
    CONSTRAINT "arcane_system_assets_asset_key_check" CHECK ((("asset_key" ~ '^arcane-[a-z0-9]+(-[a-z0-9]+)*$'::"text") OR ("asset_key" = 'arcane-trophy-room-v2.2'::"text")))
);


ALTER TABLE "public"."arcane_system_assets" OWNER TO "postgres";


COMMENT ON TABLE "public"."arcane_system_assets" IS 'Shared Arcane Paper Doll system WebP pointers; source/archive provenance remains in hermes_jobs.';



CREATE TABLE IF NOT EXISTS "public"."campaign_audio_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "cue_key" "text" NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_audio_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_audio_state" (
    "campaign_id" "uuid" NOT NULL,
    "ambience_cue_key" "text",
    "revision" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_location_id" "uuid",
    CONSTRAINT "campaign_audio_state_revision_check" CHECK (("revision" >= 0))
);


ALTER TABLE "public"."campaign_audio_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_combat_scene_characters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scene_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_combat_scene_characters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_combat_scene_combatants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scene_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "source_type" "text" DEFAULT 'custom'::"text" NOT NULL,
    "source_id" "uuid",
    "combatant_type" "text" DEFAULT 'npc'::"text" NOT NULL,
    "instance_no" integer DEFAULT 1 NOT NULL,
    "name" "text" NOT NULL,
    "visible_to_players" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "start_q" integer,
    "start_r" integer,
    CONSTRAINT "campaign_combat_scene_combatants_instance_check" CHECK (("instance_no" >= 1)),
    CONSTRAINT "campaign_combat_scene_combatants_source_type_check" CHECK (("source_type" = ANY (ARRAY['character'::"text", 'npc'::"text", 'monster'::"text", 'custom'::"text"]))),
    CONSTRAINT "campaign_combat_scene_combatants_start_hex_pair" CHECK (((("start_q" IS NULL) AND ("start_r" IS NULL)) OR (("start_q" IS NOT NULL) AND ("start_r" IS NOT NULL)))),
    CONSTRAINT "campaign_combat_scene_combatants_type_check" CHECK (("combatant_type" = ANY (ARRAY['player'::"text", 'npc'::"text", 'enemy'::"text", 'monster'::"text"])))
);


ALTER TABLE "public"."campaign_combat_scene_combatants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_combat_scene_hexes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scene_id" "uuid" NOT NULL,
    "q" integer NOT NULL,
    "r" integer NOT NULL,
    "movement_mode" "text" DEFAULT 'free'::"text" NOT NULL,
    "sight_mode" "text" DEFAULT 'clear'::"text" NOT NULL,
    "movement_cost" numeric(6,2) DEFAULT 1 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_event_combat_scene_hexes_cost_check" CHECK (("movement_cost" > (0)::numeric)),
    CONSTRAINT "campaign_event_combat_scene_hexes_movement_check" CHECK (("movement_mode" = ANY (ARRAY['free'::"text", 'difficult'::"text", 'blocked'::"text"]))),
    CONSTRAINT "campaign_event_combat_scene_hexes_sight_check" CHECK (("sight_mode" = ANY (ARRAY['clear'::"text", 'obscuring'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."campaign_combat_scene_hexes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_combat_scene_monsters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scene_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "monster_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_event_combat_scene_monsters_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 100)))
);


ALTER TABLE "public"."campaign_combat_scene_monsters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_combat_scene_npcs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "scene_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "npc_id" "uuid" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_combat_scene_npcs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_combat_scenes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "source_event_id" "uuid",
    "campaign_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "map_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "hex_orientation" "text" DEFAULT 'pointy'::"text" NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "background_image_path" "text",
    "background_width" integer,
    "background_height" integer,
    CONSTRAINT "campaign_combat_scenes_background_dimensions_check" CHECK (((("background_image_path" IS NULL) AND ("background_width" IS NULL) AND ("background_height" IS NULL)) OR (("background_image_path" IS NOT NULL) AND ("background_width" > 0) AND ("background_height" > 0)))),
    CONSTRAINT "campaign_event_combat_scenes_orientation_check" CHECK (("hex_orientation" = ANY (ARRAY['pointy'::"text", 'flat'::"text"])))
);


ALTER TABLE "public"."campaign_combat_scenes" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaign_combat_scenes"."source_event_id" IS 'Optional historical/source event. Combat scenes are owned by the campaign, not by an event.';



COMMENT ON COLUMN "public"."campaign_combat_scenes"."background_image_path" IS 'Optional scene-local background image in Storage bucket combat-scene-maps. This is not a campaign_maps/location map.';



CREATE TABLE IF NOT EXISTS "public"."campaign_day_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "day_number" integer NOT NULL,
    "weather" "text" DEFAULT ''::"text" NOT NULL,
    "with_rest" boolean DEFAULT true NOT NULL,
    "erf_cycle" integer NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "started_by" "uuid",
    "rest_hours" numeric(5,2) DEFAULT 0 NOT NULL,
    CONSTRAINT "campaign_day_history_day_number_check" CHECK (("day_number" >= 1)),
    CONSTRAINT "campaign_day_history_erf_cycle_check" CHECK (("erf_cycle" >= 1)),
    CONSTRAINT "campaign_day_history_rest_hours_check" CHECK (("rest_hours" >= (0)::numeric))
);


ALTER TABLE "public"."campaign_day_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_day_state" (
    "campaign_id" "uuid" NOT NULL,
    "day_number" integer DEFAULT 1 NOT NULL,
    "weather" "text" DEFAULT ''::"text" NOT NULL,
    "with_rest" boolean DEFAULT true NOT NULL,
    "erf_cycle" integer DEFAULT 1 NOT NULL,
    "erf_enabled" boolean DEFAULT true NOT NULL,
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rest_hours" numeric(5,2) DEFAULT 0 NOT NULL,
    "time_of_day" "text" DEFAULT 'morning'::"text" NOT NULL,
    CONSTRAINT "campaign_day_state_day_number_check" CHECK (("day_number" >= 1)),
    CONSTRAINT "campaign_day_state_erf_cycle_check" CHECK (("erf_cycle" >= 1)),
    CONSTRAINT "campaign_day_state_rest_hours_check" CHECK (("rest_hours" >= (0)::numeric)),
    CONSTRAINT "campaign_day_state_time_of_day_check" CHECK (("time_of_day" = ANY (ARRAY['dawn'::"text", 'morning'::"text", 'midday'::"text", 'afternoon'::"text", 'evening'::"text", 'night'::"text"])))
);


ALTER TABLE "public"."campaign_day_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_event_combat_hexes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "q" integer NOT NULL,
    "r" integer NOT NULL,
    "movement_mode" "text" DEFAULT 'free'::"text" NOT NULL,
    "sight_mode" "text" DEFAULT 'clear'::"text" NOT NULL,
    "movement_cost" numeric(6,2) DEFAULT 1 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_event_combat_hexes_cost_check" CHECK (("movement_cost" > (0)::numeric)),
    CONSTRAINT "campaign_event_combat_hexes_movement_check" CHECK (("movement_mode" = ANY (ARRAY['free'::"text", 'difficult'::"text", 'blocked'::"text"]))),
    CONSTRAINT "campaign_event_combat_hexes_sight_check" CHECK (("sight_mode" = ANY (ARRAY['clear'::"text", 'obscuring'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."campaign_event_combat_hexes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_event_combat_spawns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid" NOT NULL,
    "name_override" "text" DEFAULT ''::"text" NOT NULL,
    "side" "text" DEFAULT 'enemies'::"text" NOT NULL,
    "q" integer,
    "r" integer,
    "quantity" integer DEFAULT 1 NOT NULL,
    "controller_user_id" "uuid",
    "flying" boolean DEFAULT false NOT NULL,
    "hidden_initially" boolean DEFAULT false NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_event_combat_spawns_position_check" CHECK (((("q" IS NULL) AND ("r" IS NULL)) OR (("q" IS NOT NULL) AND ("r" IS NOT NULL)))),
    CONSTRAINT "campaign_event_combat_spawns_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 100))),
    CONSTRAINT "campaign_event_combat_spawns_side_check" CHECK (("side" = ANY (ARRAY['heroes'::"text", 'enemies'::"text", 'neutral'::"text"]))),
    CONSTRAINT "campaign_event_combat_spawns_source_check" CHECK (("source_type" = ANY (ARRAY['character'::"text", 'npc'::"text", 'monster'::"text"])))
);


ALTER TABLE "public"."campaign_event_combat_spawns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_event_combats" (
    "event_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "map_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "hex_orientation" "text" DEFAULT 'pointy'::"text" NOT NULL,
    "hex_size" integer DEFAULT 48 NOT NULL,
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_event_combats_hex_size_check" CHECK ((("hex_size" >= 20) AND ("hex_size" <= 200))),
    CONSTRAINT "campaign_event_combats_orientation_check" CHECK (("hex_orientation" = ANY (ARRAY['pointy'::"text", 'flat'::"text"])))
);


ALTER TABLE "public"."campaign_event_combats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_event_enemies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "monster_id" "uuid" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_event_enemies_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 100)))
);


ALTER TABLE "public"."campaign_event_enemies" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "event_key" "text",
    "name" "text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "read_aloud" "text" DEFAULT ''::"text" NOT NULL,
    "trigger_text" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "player_visible" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_events_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'active'::"text", 'resolved'::"text", 'disabled'::"text"])))
);


ALTER TABLE "public"."campaign_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_image_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "image_id" "uuid" NOT NULL,
    "object_type" "text" NOT NULL,
    "object_id" "uuid" NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL,
    "player_visible" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "caption" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_image_links_object_type_check" CHECK (("object_type" = ANY (ARRAY['place'::"text", 'person'::"text", 'enemy'::"text", 'event'::"text", 'item'::"text"])))
);


ALTER TABLE "public"."campaign_image_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "title" "text" DEFAULT 'Namnlös bild'::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "storage_bucket" "text" DEFAULT 'campaign-location-assets'::"text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" DEFAULT 'image/png'::"text" NOT NULL,
    "source" "text" DEFAULT 'upload'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_journal_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" DEFAULT ''::"text" NOT NULL,
    "actor_name" "text" DEFAULT ''::"text" NOT NULL,
    "outcome" "text" DEFAULT ''::"text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "player_visible" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "source_key" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_journal_entries_event_type_check" CHECK (("event_type" = ANY (ARRAY['skill'::"text", 'spell'::"text", 'dice'::"text", 'combat'::"text", 'day'::"text", 'note'::"text"]))),
    CONSTRAINT "campaign_journal_entries_title_check" CHECK ((("char_length"("title") >= 1) AND ("char_length"("title") <= 180)))
);


ALTER TABLE "public"."campaign_journal_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "asset_type" "text" DEFAULT 'image'::"text" NOT NULL,
    "title" "text",
    "description" "text",
    "storage_path" "text" NOT NULL,
    "player_visible" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "asset_kind" "text" DEFAULT 'image'::"text" NOT NULL,
    "caption" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid",
    CONSTRAINT "campaign_location_assets_asset_type_check" CHECK (("asset_type" = ANY (ARRAY['image'::"text", 'handout'::"text", 'document'::"text", 'audio'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."campaign_location_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_event_links" (
    "campaign_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "relation_kind" "text" DEFAULT 'related'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_location_event_links_relation_kind_check" CHECK (("relation_kind" = ANY (ARRAY['primary'::"text", 'related'::"text"])))
);


ALTER TABLE "public"."campaign_location_event_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "event_key" "text",
    "name" "text" NOT NULL,
    "gm_description" "text",
    "trigger_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_location_events_trigger_mode_check" CHECK (("trigger_mode" = ANY (ARRAY['manual'::"text", 'on_enter'::"text", 'on_explore'::"text", 'on_inspect'::"text"])))
);


ALTER TABLE "public"."campaign_location_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_gm_notes" (
    "location_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "gm_description" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "note_kind" "text" DEFAULT 'general'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_location_gm_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_monster_links" (
    "campaign_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "monster_id" "uuid" NOT NULL,
    "relation_kind" "text" DEFAULT 'related'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_location_monster_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_npc_links" (
    "campaign_id" "uuid" NOT NULL,
    "location_id" "uuid" NOT NULL,
    "npc_id" "uuid" NOT NULL,
    "relation_kind" "text" DEFAULT 'related'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_location_npc_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_player_texts" (
    "location_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "player_description" "text",
    "player_visible" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "text_kind" "text" DEFAULT 'description'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_location_player_texts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_location_state" (
    "location_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'unknown'::"text" NOT NULL,
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_location_state_status_check" CHECK (("status" = ANY (ARRAY['unknown'::"text", 'unexplored'::"text", 'explored'::"text"])))
);


ALTER TABLE "public"."campaign_location_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_locations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "site_id" "uuid" NOT NULL,
    "location_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "location_type" "text" DEFAULT 'room'::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ambience_cue_key" "text",
    CONSTRAINT "campaign_locations_location_type_check" CHECK (("location_type" = ANY (ARRAY['room'::"text", 'corridor'::"text", 'building'::"text", 'outdoor'::"text", 'cave'::"text", 'passage'::"text", 'stairs'::"text", 'area'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."campaign_locations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_map_areas" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "map_id" "uuid" NOT NULL,
    "location_id" "uuid",
    "shape_type" "text" DEFAULT 'polygon'::"text" NOT NULL,
    "shape_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_map_areas_shape_type_check" CHECK (("shape_type" = ANY (ARRAY['polygon'::"text", 'rect'::"text"])))
);


ALTER TABLE "public"."campaign_map_areas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_map_settings" (
    "campaign_id" "uuid" NOT NULL,
    "active_map_id" "uuid",
    "updated_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_map_settings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_map_signals" (
    "campaign_id" "uuid" NOT NULL,
    "revision" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_map_signals_revision_check" CHECK (("revision" >= 0))
);


ALTER TABLE "public"."campaign_map_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_maps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "site_id" "uuid",
    "name" "text" NOT NULL,
    "image_path" "text" NOT NULL,
    "width" integer NOT NULL,
    "height" integer NOT NULL,
    "player_visible" boolean DEFAULT false NOT NULL,
    "first_activated_at" timestamp with time zone,
    "last_activated_at" timestamp with time zone,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "fully_revealed" boolean DEFAULT false NOT NULL,
    CONSTRAINT "campaign_maps_height_check" CHECK (("height" > 0)),
    CONSTRAINT "campaign_maps_width_check" CHECK (("width" > 0))
);


ALTER TABLE "public"."campaign_maps" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_material_gm_notes" (
    "material_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaign_material_gm_notes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_material_links" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_material_links_kind_check" CHECK (("entity_type" = ANY (ARRAY['location'::"text", 'npc'::"text", 'monster'::"text", 'event'::"text", 'combat_scene'::"text"])))
);


ALTER TABLE "public"."campaign_material_links" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_material_presentation_history" (
    "campaign_id" "uuid" NOT NULL,
    "revision" bigint NOT NULL,
    "material_id" "uuid" NOT NULL,
    "shown_by" "uuid",
    "shown_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_material_presentation_history_revision_check" CHECK (("revision" > 0))
);


ALTER TABLE "public"."campaign_material_presentation_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_material_presentations" (
    "campaign_id" "uuid" NOT NULL,
    "material_id" "uuid",
    "shown_by" "uuid",
    "shown_at" timestamp with time zone,
    "revision" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_material_presentation_state_check" CHECK (((("material_id" IS NULL) AND ("shown_at" IS NULL)) OR (("material_id" IS NOT NULL) AND ("shown_at" IS NOT NULL)))),
    CONSTRAINT "campaign_material_presentations_revision_check" CHECK (("revision" >= 0))
);


ALTER TABLE "public"."campaign_material_presentations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_material_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "material_id" "uuid" NOT NULL,
    "shared_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "revoked_at" timestamp with time zone,
    CONSTRAINT "campaign_material_shares_dates" CHECK ((("revoked_at" IS NULL) OR ("revoked_at" >= "created_at")))
);


ALTER TABLE "public"."campaign_material_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_material_signals" (
    "campaign_id" "uuid" NOT NULL,
    "presentation_revision" bigint DEFAULT 0 NOT NULL,
    "folder_revision" bigint DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_material_signals_folder_revision_check" CHECK (("folder_revision" >= 0)),
    CONSTRAINT "campaign_material_signals_presentation_revision_check" CHECK (("presentation_revision" >= 0))
);


ALTER TABLE "public"."campaign_material_signals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "asset_kind" "text" DEFAULT 'image'::"text" NOT NULL,
    "storage_bucket" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "original_filename" "text" DEFAULT ''::"text" NOT NULL,
    "file_size_bytes" bigint,
    "sha256" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "archived_at" timestamp with time zone,
    "thumbnail_path" "text",
    CONSTRAINT "campaign_material_thumb_scope" CHECK ((("thumbnail_path" IS NULL) OR (("storage_bucket" = 'campaign-materials'::"text") AND ("split_part"("thumbnail_path", '/'::"text", 1) = ("campaign_id")::"text") AND ("split_part"("thumbnail_path", '/'::"text", 2) = "split_part"("storage_path", '/'::"text", 2)) AND ("split_part"("thumbnail_path", '/'::"text", 3) = 'thumb.webp'::"text") AND ("array_length"("string_to_array"("thumbnail_path", '/'::"text"), 1) = 3)))),
    CONSTRAINT "campaign_materials_bucket_check" CHECK (("storage_bucket" = ANY (ARRAY['campaign-materials'::"text", 'campaign-actor-images'::"text", 'campaign-location-assets'::"text", 'campaign-maps'::"text", 'combat-scene-maps'::"text", 'combat-icons'::"text"]))),
    CONSTRAINT "campaign_materials_category_check" CHECK (("category" = ANY (ARRAY['location'::"text", 'npc'::"text", 'monster'::"text", 'item'::"text", 'map'::"text", 'document'::"text", 'other'::"text"]))),
    CONSTRAINT "campaign_materials_kind_check" CHECK (("asset_kind" = ANY (ARRAY['image'::"text", 'document'::"text", 'text'::"text"]))),
    CONSTRAINT "campaign_materials_mime_check" CHECK (((("asset_kind" = 'image'::"text") AND ("mime_type" = ANY (ARRAY['image/png'::"text", 'image/jpeg'::"text", 'image/webp'::"text"]))) OR (("asset_kind" = 'document'::"text") AND ("mime_type" = 'application/pdf'::"text")) OR (("asset_kind" = 'text'::"text") AND ("mime_type" = 'text/plain'::"text")))),
    CONSTRAINT "campaign_materials_path_scope_check" CHECK ((("split_part"("storage_path", '/'::"text", 1) = ("campaign_id")::"text") AND ("length"("storage_path") > ("length"(("campaign_id")::"text") + 1)) AND ("storage_path" !~~ '%..%'::"text") AND ("storage_path" !~~ '%//%'::"text"))),
    CONSTRAINT "campaign_materials_sha_check" CHECK ((("sha256" IS NULL) OR ("sha256" ~ '^[a-f0-9]{64}$'::"text"))),
    CONSTRAINT "campaign_materials_size_check" CHECK ((("file_size_bytes" IS NULL) OR (("file_size_bytes" >= 0) AND ("file_size_bytes" <= 20971520)))),
    CONSTRAINT "campaign_materials_title_nonempty" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 160)))
);


ALTER TABLE "public"."campaign_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_members" (
    "campaign_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_members_role_check" CHECK (("role" = ANY (ARRAY['player'::"text", 'gm'::"text"])))
);


ALTER TABLE "public"."campaign_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_monsters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "monster_key" "text",
    "name" "text" NOT NULL,
    "monster_type" "text" DEFAULT ''::"text" NOT NULL,
    "quantity" integer DEFAULT 1 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "gm_notes" "text" DEFAULT ''::"text" NOT NULL,
    "current_location_id" "uuid",
    "player_visible" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "combat_icon_path" "text",
    "actor_kind" "text" DEFAULT 'enemy'::"text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "race" "text" DEFAULT ''::"text" NOT NULL,
    "gender" "text" DEFAULT ''::"text" NOT NULL,
    "profession" "text" DEFAULT ''::"text" NOT NULL,
    "image_path" "text",
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "skills" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "weapons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "shield" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "armor" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "campaign_monsters_actor_kind_check" CHECK (("actor_kind" = ANY (ARRAY['enemy'::"text", 'monster'::"text"]))),
    CONSTRAINT "campaign_monsters_quantity_check" CHECK (("quantity" >= 0))
);


ALTER TABLE "public"."campaign_monsters" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaign_npcs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "npc_key" "text",
    "name" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "gm_notes" "text" DEFAULT ''::"text" NOT NULL,
    "current_location_id" "uuid",
    "player_visible" boolean DEFAULT false NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "combat_icon_path" "text",
    "image_path" "text",
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "skills" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "weapons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "shield" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "armor" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "race" "text" DEFAULT ''::"text" NOT NULL,
    "gender" "text" DEFAULT ''::"text" NOT NULL,
    "profession" "text" DEFAULT ''::"text" NOT NULL,
    "spells" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "source_global_npc_id" "uuid",
    CONSTRAINT "campaign_npcs_armor_object" CHECK (("jsonb_typeof"("armor") = 'object'::"text")),
    CONSTRAINT "campaign_npcs_attributes_object" CHECK (("jsonb_typeof"("attributes") = 'object'::"text")),
    CONSTRAINT "campaign_npcs_shield_object" CHECK (("jsonb_typeof"("shield") = 'object'::"text")),
    CONSTRAINT "campaign_npcs_skills_array" CHECK (("jsonb_typeof"("skills") = 'array'::"text")),
    CONSTRAINT "campaign_npcs_weapons_array" CHECK (("jsonb_typeof"("weapons") = 'array'::"text"))
);


ALTER TABLE "public"."campaign_npcs" OWNER TO "postgres";


COMMENT ON COLUMN "public"."campaign_npcs"."spells" IS 'Individuella besvärjelser för kampanj-SLP; poster med namn, FV, regel-id och magiskole-FV används i stridsmotorn.';



CREATE TABLE IF NOT EXISTS "public"."campaign_sites" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "parent_site_id" "uuid",
    "site_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "site_type" "text" DEFAULT 'area'::"text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "campaign_sites_site_type_check" CHECK (("site_type" = ANY (ARRAY['area'::"text", 'village'::"text", 'town'::"text", 'building'::"text", 'castle'::"text", 'cave'::"text", 'dungeon'::"text", 'catacomb'::"text", 'floor'::"text", 'outdoor'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."campaign_sites" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."campaigns" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_erf_awards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "item_group" "text" NOT NULL,
    "item_key" "text" NOT NULL,
    "day_number" integer NOT NULL,
    "erf_cycle" integer NOT NULL,
    "awarded_by" "uuid",
    "awarded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "amount" integer DEFAULT 1 NOT NULL,
    "reason" "text" DEFAULT 'success'::"text" NOT NULL,
    CONSTRAINT "character_erf_awards_amount_check" CHECK ((("amount" >= 1) AND ("amount" <= 4))),
    CONSTRAINT "character_erf_awards_day_number_check" CHECK (("day_number" >= 1)),
    CONSTRAINT "character_erf_awards_erf_cycle_check" CHECK (("erf_cycle" >= 1)),
    CONSTRAINT "character_erf_awards_item_group_check" CHECK (("item_group" = ANY (ARRAY['skills'::"text", 'baseChanceSkills'::"text", 'weapons'::"text", 'shields'::"text", 'spells'::"text"]))),
    CONSTRAINT "character_erf_awards_reason_check" CHECK (("reason" = ANY (ARRAY['success'::"text", 'special'::"text", 'perfect'::"text", 'manual'::"text"])))
);


ALTER TABLE "public"."character_erf_awards" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."character_rest_state" (
    "character_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "erf_cycle" integer DEFAULT 1 NOT NULL,
    "last_day_number" integer DEFAULT 1 NOT NULL,
    "last_rest_hours" numeric(5,2) DEFAULT 0 NOT NULL,
    "last_erf_reset_day" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "character_rest_state_erf_cycle_check" CHECK (("erf_cycle" >= 1)),
    CONSTRAINT "character_rest_state_last_day_number_check" CHECK (("last_day_number" >= 1)),
    CONSTRAINT "character_rest_state_last_erf_reset_day_check" CHECK (("last_erf_reset_day" >= 1)),
    CONSTRAINT "character_rest_state_last_rest_hours_check" CHECK (("last_rest_hours" >= (0)::numeric))
);


ALTER TABLE "public"."character_rest_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."characters" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "owner_id" "uuid",
    "name" "text" DEFAULT 'Namnlös'::"text" NOT NULL,
    "is_npc" boolean DEFAULT false NOT NULL,
    "schema_version" integer DEFAULT 1 NOT NULL,
    "data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "combat_icon_path" "text",
    "round_background_path" "text",
    CONSTRAINT "character_round_background_scoped" CHECK ((("round_background_path" IS NULL) OR (("round_background_path" ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::"text") AND ("split_part"("round_background_path", '/'::"text", 1) = ("campaign_id")::"text") AND ("split_part"("round_background_path", '/'::"text", 2) = ("id")::"text"))))
);


ALTER TABLE "public"."characters" OWNER TO "postgres";


COMMENT ON COLUMN "public"."characters"."round_background_path" IS 'Campaign-scoped private WebP used when this character is the active combatant in the round panel.';



CREATE TABLE IF NOT EXISTS "public"."combat_actions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "combatant_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "phase" "text" NOT NULL,
    "action_type" "text" NOT NULL,
    "slot_key" "text" DEFAULT ''::"text" NOT NULL,
    "source_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "target_combatant_id" "uuid",
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "sequence" integer DEFAULT 0 NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "player_visible" boolean DEFAULT true NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combat_actions_phase_check" CHECK (("phase" = ANY (ARRAY['initiative'::"text", 'declaration'::"text", 'movement'::"text", 'magic'::"text", 'quick'::"text", 'normal'::"text", 'new_contact'::"text", 'late'::"text", 'effects'::"text", 'round_end'::"text", 'reaction'::"text"]))),
    CONSTRAINT "combat_actions_round_check" CHECK (("round_number" >= 1)),
    CONSTRAINT "combat_actions_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'reserved'::"text", 'pending'::"text", 'resolving'::"text", 'resolved'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "combat_actions_type_check" CHECK (("action_type" = ANY (ARRAY['attack'::"text", 'parry'::"text", 'spell'::"text", 'move'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."combat_actions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combat_ammunition_spends" (
    "action_id" "uuid" NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "combatant_id" "uuid" NOT NULL,
    "character_id" "uuid",
    "projectile_key" "text" NOT NULL,
    "weapon_key" "text" NOT NULL,
    "recovered" boolean DEFAULT false NOT NULL,
    "recovery_attempted" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."combat_ammunition_spends" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combat_animation_cues" (
    "event_key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "category" "text" DEFAULT 'combat'::"text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "asset_path" "text",
    "speed" numeric(4,2) DEFAULT 1 NOT NULL,
    "scale" numeric(4,2) DEFAULT 1 NOT NULL,
    "opacity" numeric(4,2) DEFAULT 1 NOT NULL,
    "offset_x" integer DEFAULT 0 NOT NULL,
    "offset_y" integer DEFAULT 0 NOT NULL,
    "blend_mode" "text" DEFAULT 'screen'::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "animation_type" "text" DEFAULT 'other'::"text" NOT NULL,
    CONSTRAINT "combat_animation_cues_blend_mode_check" CHECK (("blend_mode" = ANY (ARRAY['screen'::"text", 'lighten'::"text", 'normal'::"text"]))),
    CONSTRAINT "combat_animation_cues_category_check" CHECK (("category" = ANY (ARRAY['melee'::"text", 'ranged'::"text", 'magic'::"text", 'combat'::"text", 'defense'::"text", 'system'::"text"]))),
    CONSTRAINT "combat_animation_cues_event_key_check" CHECK (("event_key" ~ '^[a-z][a-z0-9]*(\.[a-z0-9]+)+$'::"text")),
    CONSTRAINT "combat_animation_cues_label_check" CHECK ((("length"(TRIM(BOTH FROM "label")) >= 2) AND ("length"(TRIM(BOTH FROM "label")) <= 96))),
    CONSTRAINT "combat_animation_cues_offset_x_check" CHECK ((("offset_x" >= '-400'::integer) AND ("offset_x" <= 400))),
    CONSTRAINT "combat_animation_cues_offset_y_check" CHECK ((("offset_y" >= '-400'::integer) AND ("offset_y" <= 400))),
    CONSTRAINT "combat_animation_cues_opacity_check" CHECK ((("opacity" >= 0.1) AND ("opacity" <= (1)::numeric))),
    CONSTRAINT "combat_animation_cues_scale_check" CHECK ((("scale" >= 0.25) AND ("scale" <= (3)::numeric))),
    CONSTRAINT "combat_animation_cues_speed_check" CHECK ((("speed" >= 0.25) AND ("speed" <= (4)::numeric))),
    CONSTRAINT "hermes_animation_asset_path" CHECK ((("asset_path" IS NULL) OR ("asset_path" ~ '^events/[a-z][a-z0-9]*(\.[a-z0-9]+)+/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|webm)$'::"text"))),
    CONSTRAINT "hermes_animation_type_valid" CHECK (("animation_type" = ANY (ARRAY['projectile'::"text", 'effect'::"text", 'attack'::"text", 'area'::"text", 'system'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."combat_animation_cues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combat_area_effects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "effect_id" "uuid" NOT NULL,
    "source_combatant_id" "uuid",
    "center_q" integer NOT NULL,
    "center_r" integer NOT NULL,
    "radius" integer DEFAULT 0 NOT NULL,
    "applied_round" integer NOT NULL,
    "expires_round" integer,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "parameters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combat_area_effects_applied_round_check" CHECK (("applied_round" >= 1)),
    CONSTRAINT "combat_area_effects_check" CHECK ((("expires_round" IS NULL) OR ("expires_round" >= "applied_round"))),
    CONSTRAINT "combat_area_effects_radius_check" CHECK ((("radius" >= 0) AND ("radius" <= 15))),
    CONSTRAINT "combat_area_effects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."combat_area_effects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combat_area_events" (
    "id" bigint NOT NULL,
    "area_id" "uuid" NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "combatant_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "event_type" "text" NOT NULL,
    "gross_damage" integer DEFAULT 0 NOT NULL,
    "protection" integer DEFAULT 0 NOT NULL,
    "net_damage" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combat_area_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['enter'::"text", 'stay'::"text", 'exit'::"text"]))),
    CONSTRAINT "combat_area_events_gross_damage_check" CHECK (("gross_damage" >= 0)),
    CONSTRAINT "combat_area_events_net_damage_check" CHECK (("net_damage" >= 0)),
    CONSTRAINT "combat_area_events_protection_check" CHECK (("protection" >= 0)),
    CONSTRAINT "combat_area_events_round_number_check" CHECK (("round_number" >= 1))
);


ALTER TABLE "public"."combat_area_events" OWNER TO "postgres";


ALTER TABLE "public"."combat_area_events" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."combat_area_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."combat_hexes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "q" integer NOT NULL,
    "r" integer NOT NULL,
    "movement_mode" "text" DEFAULT 'free'::"text" NOT NULL,
    "sight_mode" "text" DEFAULT 'clear'::"text" NOT NULL,
    "movement_cost" numeric(6,2) DEFAULT 1 NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combat_hexes_cost_check" CHECK (("movement_cost" > (0)::numeric)),
    CONSTRAINT "combat_hexes_movement_check" CHECK (("movement_mode" = ANY (ARRAY['free'::"text", 'difficult'::"text", 'blocked'::"text"]))),
    CONSTRAINT "combat_hexes_sight_check" CHECK (("sight_mode" = ANY (ARRAY['clear'::"text", 'obscuring'::"text", 'blocked'::"text"])))
);


ALTER TABLE "public"."combat_hexes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combat_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "event_id" "uuid",
    "map_id" "uuid",
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'setup'::"text" NOT NULL,
    "round_number" integer DEFAULT 1 NOT NULL,
    "phase" "text" DEFAULT 'initiative'::"text" NOT NULL,
    "winning_side" "text",
    "initiative" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active_actor_id" "uuid",
    "active_responder_id" "uuid",
    "settings" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "started_by" "uuid",
    "started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combat_instances_phase_check" CHECK (("phase" = ANY (ARRAY['initiative'::"text", 'declaration'::"text", 'movement'::"text", 'magic'::"text", 'quick'::"text", 'normal'::"text", 'new_contact'::"text", 'late'::"text", 'effects'::"text", 'round_end'::"text"]))),
    CONSTRAINT "combat_instances_round_check" CHECK (("round_number" >= 1)),
    CONSTRAINT "combat_instances_side_check" CHECK ((("winning_side" IS NULL) OR ("winning_side" = ANY (ARRAY['heroes'::"text", 'enemies'::"text", 'neutral'::"text"])))),
    CONSTRAINT "combat_instances_status_check" CHECK (("status" = ANY (ARRAY['setup'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))
);


ALTER TABLE "public"."combat_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combat_log" (
    "id" bigint NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "round_number" integer NOT NULL,
    "phase" "text" NOT NULL,
    "actor_id" "uuid",
    "target_id" "uuid",
    "event_type" "text" NOT NULL,
    "message" "text" NOT NULL,
    "details" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "player_visible" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combat_log_round_check" CHECK (("round_number" >= 1))
);


ALTER TABLE "public"."combat_log" OWNER TO "postgres";


ALTER TABLE "public"."combat_log" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."combat_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."combatant_battle_poses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combatant_type" "text" NOT NULL,
    "combatant_id" "uuid" NOT NULL,
    "pose_key" "text" NOT NULL,
    "image_path" "text",
    "base_key" "text" DEFAULT 'arcane-paper-doll-hexagon-base'::"text" NOT NULL,
    "mounting_profile" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_drive_file_id" "text",
    "publication_status" "text" DEFAULT 'published'::"text" NOT NULL,
    "staging_path" "text",
    "source_sha256" "text",
    "pending_staging_path" "text",
    "pending_base_key" "text",
    "pending_mounting_profile" "jsonb",
    CONSTRAINT "battle_pose_staging_path_format" CHECK ((("staging_path" IS NULL) OR ("staging_path" ~ '^battle-pose/[a-z0-9_-]+/[0-9a-f-]{36}/[a-z0-9_]+/[0-9a-f-]{36}\.(png|webp)$'::"text"))),
    CONSTRAINT "combatant_battle_poses_combatant_type_check" CHECK (("combatant_type" = ANY (ARRAY['character'::"text", 'character-npc'::"text", 'campaign-npc'::"text", 'global-npc'::"text", 'enemy'::"text", 'monster'::"text"]))),
    CONSTRAINT "combatant_battle_poses_image_path_check" CHECK (("image_path" ~ '^hermes/'::"text")),
    CONSTRAINT "combatant_battle_poses_pose_key_check" CHECK (("pose_key" ~ '^[a-z][a-z0-9_]{1,63}$'::"text")),
    CONSTRAINT "combatant_battle_poses_publication_status_check" CHECK (("publication_status" = ANY (ARRAY['draft'::"text", 'queued'::"text", 'published'::"text", 'failed'::"text"]))),
    CONSTRAINT "combatant_pose_image_publication_check" CHECK ((("publication_status" <> 'published'::"text") OR ("image_path" IS NOT NULL))),
    CONSTRAINT "combatant_pose_mounting_profile_check" CHECK (("jsonb_typeof"("mounting_profile") = 'object'::"text"))
);


ALTER TABLE "public"."combatant_battle_poses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combatant_effects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "combatant_id" "uuid" NOT NULL,
    "effect_id" "uuid" NOT NULL,
    "source_combatant_id" "uuid",
    "source_action_id" "uuid",
    "strength" integer DEFAULT 1 NOT NULL,
    "applied_round" integer DEFAULT 1 NOT NULL,
    "expires_round" integer,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "parameters" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "expiration_condition" "text",
    "source_label" "text",
    "expires_at" timestamp with time zone,
    CONSTRAINT "combatant_effects_check" CHECK ((("expires_round" IS NULL) OR ("expires_round" >= "applied_round"))),
    CONSTRAINT "combatant_effects_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'expired'::"text", 'removed'::"text"]))),
    CONSTRAINT "combatant_effects_strength_check" CHECK (("strength" >= 1))
);


ALTER TABLE "public"."combatant_effects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."combatants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "combat_id" "uuid" NOT NULL,
    "campaign_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "source_id" "uuid",
    "source_instance_key" "text" DEFAULT ''::"text" NOT NULL,
    "name_snapshot" "text" NOT NULL,
    "side" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "controller_user_id" "uuid",
    "q" integer DEFAULT 0 NOT NULL,
    "r" integer DEFAULT 0 NOT NULL,
    "flying" boolean DEFAULT false NOT NULL,
    "visible_to_players" boolean DEFAULT true NOT NULL,
    "current_kp" integer,
    "max_kp" integer,
    "current_psy" integer,
    "max_psy" integer,
    "movement_max" numeric(6,2),
    "movement_remaining" numeric(6,2),
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "action_plan" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "state" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "combatants_kp_check" CHECK (((("max_kp" IS NULL) OR ("max_kp" >= 0)) AND (("current_kp" IS NULL) OR ("current_kp" >= 0)))),
    CONSTRAINT "combatants_move_check" CHECK (((("movement_max" IS NULL) OR ("movement_max" >= (0)::numeric)) AND (("movement_remaining" IS NULL) OR ("movement_remaining" >= (0)::numeric)))),
    CONSTRAINT "combatants_psy_check" CHECK (((("max_psy" IS NULL) OR ("max_psy" >= 0)) AND (("current_psy" IS NULL) OR ("current_psy" >= 0)))),
    CONSTRAINT "combatants_side_check" CHECK (("side" = ANY (ARRAY['heroes'::"text", 'enemies'::"text", 'neutral'::"text"]))),
    CONSTRAINT "combatants_source_check" CHECK (((("source_type" = ANY (ARRAY['character'::"text", 'npc'::"text", 'monster'::"text"])) AND ("source_id" IS NOT NULL)) OR (("source_type" = 'quick_enemy'::"text") AND ("source_id" IS NULL)))),
    CONSTRAINT "combatants_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'unconscious'::"text", 'defeated'::"text", 'dead'::"text", 'removed'::"text"])))
);


ALTER TABLE "public"."combatants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."global_npcs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "npc_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "gm_notes" "text" DEFAULT ''::"text" NOT NULL,
    "age_years" integer,
    "race" "text" DEFAULT ''::"text" NOT NULL,
    "gender" "text" DEFAULT ''::"text" NOT NULL,
    "profession" "text" DEFAULT ''::"text" NOT NULL,
    "appearance" "text" DEFAULT ''::"text" NOT NULL,
    "personality" "text" DEFAULT ''::"text" NOT NULL,
    "motivation" "text" DEFAULT ''::"text" NOT NULL,
    "weakness" "text" DEFAULT ''::"text" NOT NULL,
    "background" "text" DEFAULT ''::"text" NOT NULL,
    "relationships" "text" DEFAULT ''::"text" NOT NULL,
    "secrets" "text" DEFAULT ''::"text" NOT NULL,
    "hooks" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "equipment_notes" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "image_reference" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "image_path" "text",
    "attributes" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "skills" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "weapons" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "spells" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "shield" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "armor" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "global_npcs_age_years_check" CHECK ((("age_years" IS NULL) OR ("age_years" >= 0))),
    CONSTRAINT "global_npcs_armor_check" CHECK (("jsonb_typeof"("armor") = 'object'::"text")),
    CONSTRAINT "global_npcs_attributes_check" CHECK (("jsonb_typeof"("attributes") = 'object'::"text")),
    CONSTRAINT "global_npcs_equipment_notes_check" CHECK (("jsonb_typeof"("equipment_notes") = 'array'::"text")),
    CONSTRAINT "global_npcs_hooks_check" CHECK (("jsonb_typeof"("hooks") = 'array'::"text")),
    CONSTRAINT "global_npcs_image_reference_check" CHECK (("jsonb_typeof"("image_reference") = 'object'::"text")),
    CONSTRAINT "global_npcs_shield_check" CHECK (("jsonb_typeof"("shield") = 'object'::"text")),
    CONSTRAINT "global_npcs_skills_check" CHECK (("jsonb_typeof"("skills") = 'array'::"text")),
    CONSTRAINT "global_npcs_spells_check" CHECK (("jsonb_typeof"("spells") = 'array'::"text")),
    CONSTRAINT "global_npcs_weapons_check" CHECK (("jsonb_typeof"("weapons") = 'array'::"text"))
);


ALTER TABLE "public"."global_npcs" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."hermes_alea_assets" WITH ("security_invoker"='true') AS
 SELECT ('hermes-alea:'::"text" || ("id")::"text") AS "asset_key",
    "output_path" AS "asset_path",
    "width",
    "height",
    "alpha_preserved",
    'published'::"text" AS "publication_status"
   FROM "public"."hermes_alea_jobs"
  WHERE (("state" = 'activated'::"text") AND ("output_deleted_at" IS NULL) AND ("output_delete_reserved_at" IS NULL));


ALTER VIEW "public"."hermes_alea_assets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."honor_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "requirement_text" "text" DEFAULT ''::"text" NOT NULL,
    "visibility" "text" DEFAULT 'public'::"text" NOT NULL,
    "grant_mode" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "campaign_id" "uuid",
    "adventure_id" "text",
    "image_asset_id" "text",
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "category" "text" DEFAULT 'award'::"text" NOT NULL,
    "tier_criteria" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "badge_frame_assets" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "frame_family" "text",
    "preview_variant_id" "uuid",
    "published_variant_id" "uuid",
    "image_revision" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "honor_definitions_badge_frames_object" CHECK (("jsonb_typeof"("badge_frame_assets") = 'object'::"text")),
    CONSTRAINT "honor_definitions_category_check" CHECK (("category" = ANY (ARRAY['medal'::"text", 'award'::"text", 'badge'::"text"]))),
    CONSTRAINT "honor_definitions_grant_mode_check" CHECK (("grant_mode" = ANY (ARRAY['manual'::"text", 'automatic'::"text", 'both'::"text"]))),
    CONSTRAINT "honor_definitions_name_check" CHECK (("length"(TRIM(BOTH FROM "name")) > 0)),
    CONSTRAINT "honor_definitions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'inactive'::"text"]))),
    CONSTRAINT "honor_definitions_tier_criteria_object" CHECK (("jsonb_typeof"("tier_criteria") = 'object'::"text")),
    CONSTRAINT "honor_definitions_type_check" CHECK (("type" = ANY (ARRAY['adventure'::"text", 'campaign'::"text", 'achievement'::"text", 'honor'::"text"]))),
    CONSTRAINT "honor_definitions_visibility_check" CHECK (("visibility" = ANY (ARRAY['public'::"text", 'silhouette'::"text", 'secret'::"text"])))
);


ALTER TABLE "public"."honor_definitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."honor_definitions" IS 'ARCANE HONORS. RLS closed until GM authorization and spoiler-safe projections are implemented.';



CREATE TABLE IF NOT EXISTS "public"."honor_relief_variants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "honor_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "material" "text" NOT NULL,
    "image_asset_id" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "allow_overhang" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "image_revision" bigint DEFAULT 0 NOT NULL,
    CONSTRAINT "honor_relief_variants_image_asset_id_check" CHECK ((("image_asset_id" IS NULL) OR ("length"("btrim"("image_asset_id")) > 0))),
    CONSTRAINT "honor_relief_variants_material_check" CHECK (("material" = ANY (ARRAY['enamel'::"text", 'metal'::"text", 'wood'::"text", 'stone'::"text", 'other'::"text"]))),
    CONSTRAINT "honor_relief_variants_name_check" CHECK (("length"("btrim"("name")) > 0)),
    CONSTRAINT "honor_relief_variants_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'archived'::"text"])))
);


ALTER TABLE "public"."honor_relief_variants" OWNER TO "postgres";


COMMENT ON TABLE "public"."honor_relief_variants" IS 'Permanent ARCANE HONORS relief options; preview and published pointers are separate on honor_definitions.';



CREATE OR REPLACE VIEW "public"."hermes_alea_cleanup_report" WITH ("security_invoker"='true') AS
 SELECT "id",
    "source_path",
    "output_path",
    "archive_state",
    "archive_drive_id",
    "source_sha256",
    "output_sha256",
    (("archive_state" = 'verified'::"text") AND ("archive_drive_id" IS NOT NULL) AND ("archive_verified_at" <= ("now"() - '7 days'::interval)) AND ("source_deleted_at" IS NULL)) AS "source_candidate",
    (("state" = 'activated'::"text") AND ("archive_state" = 'verified'::"text") AND ("archive_drive_id" IS NOT NULL) AND (EXISTS ( SELECT 1
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


ALTER VIEW "public"."hermes_alea_cleanup_report" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."hermes_alea_detach_events" WITH ("security_invoker"='true') AS
 SELECT "e"."id",
    "e"."target_kind",
    "e"."target_id",
    "e"."previous_key",
    "e"."detached_at",
        CASE "e"."operation"
            WHEN 'REPLACE'::"text" THEN 'ERSATT'::"text"
            WHEN 'REMOVE'::"text" THEN 'BORTTAGEN'::"text"
            ELSE NULL::"text"
        END AS "reason",
        CASE
            WHEN ("old"."output_path" IS NOT NULL) THEN 'hermes-alea-display'::"text"
            ELSE NULL::"text"
        END AS "previous_bucket",
    "old"."output_path" AS "previous_path",
    "old"."archive_state",
    "old"."output_deleted_at"
   FROM ("public"."hermes_alea_jobs" "e"
     LEFT JOIN "public"."hermes_alea_jobs" "old" ON (("e"."previous_key" = ('hermes-alea:'::"text" || ("old"."id")::"text"))))
  WHERE (("e"."detached_at" IS NOT NULL) AND ("e"."state" = ANY (ARRAY['activated'::"text", 'removed'::"text"])));


ALTER VIEW "public"."hermes_alea_detach_events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."hermes_job_events" (
    "id" bigint NOT NULL,
    "job_id" "uuid" NOT NULL,
    "state" "text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hermes_job_events" OWNER TO "postgres";


ALTER TABLE "public"."hermes_job_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."hermes_job_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."hermes_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "kind" "text" NOT NULL,
    "target_key" "text" NOT NULL,
    "source_sha256" "text" NOT NULL,
    "app_sha256" "text" NOT NULL,
    "source_path" "text" NOT NULL,
    "app_path" "text" NOT NULL,
    "source_bytes" integer NOT NULL,
    "app_bytes" integer NOT NULL,
    "status" "text" DEFAULT 'staged'::"text" NOT NULL,
    "github_blob_sha" "text",
    "github_commit_sha" "text",
    "previous_icon_path" "text",
    "error_code" "text",
    "error_message" "text",
    "attempts" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "activated_at" timestamp with time zone,
    "origin" "text" DEFAULT 'admin'::"text" NOT NULL,
    "github_run_id" "text",
    CONSTRAINT "hermes_jobs_app_bytes_check" CHECK ((("app_bytes" >= 1) AND ("app_bytes" <= 524288))),
    CONSTRAINT "hermes_jobs_app_sha256_check" CHECK (("app_sha256" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "hermes_jobs_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "hermes_jobs_kind_check" CHECK (("kind" = ANY (ARRAY['spell'::"text", 'spell-cutout'::"text", 'symbol'::"text", 'skill'::"text", 'skill-illustration'::"text", 'skill-illustration-wide'::"text", 'spell-illustration-wide'::"text", 'spell-illustration'::"text", 'system-asset'::"text"]))),
    CONSTRAINT "hermes_jobs_origin_actor_check" CHECK (((("origin" = 'admin'::"text") AND ("created_by" IS NOT NULL) AND ("github_run_id" IS NULL)) OR (("origin" = 'github_actions'::"text") AND ("created_by" IS NULL) AND ("github_run_id" ~ '^[0-9]{6,20}$'::"text")))),
    CONSTRAINT "hermes_jobs_source_bytes_check" CHECK ((("source_bytes" >= 1) AND ("source_bytes" <= 8388608))),
    CONSTRAINT "hermes_jobs_source_sha256_check" CHECK (("source_sha256" ~ '^[0-9a-f]{64}$'::"text")),
    CONSTRAINT "hermes_jobs_status_check" CHECK (("status" = ANY (ARRAY['staged'::"text", 'awaiting_archive'::"text", 'archived'::"text", 'verified'::"text", 'active'::"text", 'failed'::"text", 'rolled_back'::"text"]))),
    CONSTRAINT "hermes_jobs_target_key_check" CHECK ((("target_key" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::"text") OR (("kind" = 'system-asset'::"text") AND ("target_key" = 'arcane-trophy-room-v2.2'::"text"))))
);


ALTER TABLE "public"."hermes_jobs" OWNER TO "postgres";


COMMENT ON TABLE "public"."hermes_jobs" IS 'HERMES 2.0 retryable media jobs; only the authenticated Edge Function service can mutate. Old icon paths remain live until verified.';



CREATE TABLE IF NOT EXISTS "public"."honor_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "honor_id" "uuid" NOT NULL,
    "character_id" "uuid" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "granted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "reason" "text",
    "source_event_id" "text",
    "revoked_at" timestamp with time zone,
    "revoked_by" "uuid",
    "revocation_reason" "text",
    CONSTRAINT "honor_grants_check" CHECK (((("revoked_at" IS NULL) AND ("revoked_by" IS NULL)) OR (("revoked_at" IS NOT NULL) AND ("revoked_by" IS NOT NULL))))
);


ALTER TABLE "public"."honor_grants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "display_name" "text",
    "email" "text",
    "is_admin" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."race_battle_poses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "race_id" "text" NOT NULL,
    "gender_variant" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "pose_key" "text" NOT NULL,
    "image_path" "text",
    "base_key" "text" DEFAULT 'arcane-bronze-ivory-pointed-hex-high-angle'::"text" NOT NULL,
    "mounting_profile" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "source_drive_file_id" "text",
    "source_sha256" "text",
    "staging_path" "text",
    "pending_staging_path" "text",
    "pending_base_key" "text",
    "pending_mounting_profile" "jsonb",
    "publication_status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "race_battle_poses_gender_variant_check" CHECK (("gender_variant" = ANY (ARRAY['male'::"text", 'female'::"text", 'neutral'::"text"]))),
    CONSTRAINT "race_battle_poses_publication_status_check" CHECK (("publication_status" = ANY (ARRAY['draft'::"text", 'pending'::"text", 'published'::"text", 'failed'::"text"]))),
    CONSTRAINT "race_pose_published_asset" CHECK ((("publication_status" <> 'published'::"text") OR (("image_path" IS NOT NULL) AND ("length"("image_path") > 0))))
);


ALTER TABLE "public"."race_battle_poses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_armor_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "abs_modifier" integer DEFAULT 0 NOT NULL,
    "bep_override" integer,
    "allowed_categories" "text"[] DEFAULT ARRAY['cloth'::"text", 'leather'::"text", 'metal'::"text"] NOT NULL,
    "base_type_key_override" "text",
    "blocks_magic_override" boolean,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_armor_materials_bep_override_check" CHECK ((("bep_override" IS NULL) OR ("bep_override" >= 0)))
);


ALTER TABLE "public"."rule_armor_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_armor_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "absorption" integer NOT NULL,
    "bep" integer NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "weight_code" "text",
    "price_per_bep" numeric,
    "source_label" "text" DEFAULT 'Alea'::"text" NOT NULL,
    "canonical_expert" boolean DEFAULT false NOT NULL,
    "icon_key" "text",
    "image_path" "text",
    "image_head_path" "text",
    "image_arms_path" "text",
    "image_torso_path" "text",
    "image_legs_path" "text",
    "is_magical" boolean DEFAULT false NOT NULL,
    "combat_crop_quadrant" "text" DEFAULT 'top-right'::"text" NOT NULL,
    CONSTRAINT "rule_armor_types_absorption_check" CHECK (("absorption" >= 0)),
    CONSTRAINT "rule_armor_types_bep_check" CHECK (("bep" >= 0)),
    CONSTRAINT "rule_armor_types_category_check" CHECK (("category" = ANY (ARRAY['cloth'::"text", 'leather'::"text", 'metal'::"text"]))),
    CONSTRAINT "rule_armor_types_crop_quadrant_ck" CHECK (("combat_crop_quadrant" = ANY (ARRAY['top-right'::"text", 'top-left'::"text", 'bottom-right'::"text", 'bottom-left'::"text", 'full'::"text"]))),
    CONSTRAINT "rule_armor_types_price_per_bep_check" CHECK ((("price_per_bep" IS NULL) OR ("price_per_bep" >= (0)::numeric))),
    CONSTRAINT "rule_armor_types_weight_code_check" CHECK ((("weight_code" IS NULL) OR ("weight_code" = ANY (ARRAY['A'::"text", 'B'::"text", 'C'::"text", 'D'::"text", 'E'::"text", 'F'::"text", 'G'::"text", 'H'::"text", 'J'::"text", 'K'::"text"]))))
);


ALTER TABLE "public"."rule_armor_types" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_armor_types"."image_path" IS 'Optional path in alea-equipment-art storage; item inventory display.';



COMMENT ON COLUMN "public"."rule_armor_types"."image_head_path" IS 'Image asset for head armor slot.';



COMMENT ON COLUMN "public"."rule_armor_types"."image_arms_path" IS 'Image asset for arm armor slot.';



COMMENT ON COLUMN "public"."rule_armor_types"."image_torso_path" IS 'Image asset for torso armor slot.';



COMMENT ON COLUMN "public"."rule_armor_types"."image_legs_path" IS 'Image asset for leg armor slot.';



COMMENT ON COLUMN "public"."rule_armor_types"."is_magical" IS 'Only this armor master type is itself magical. Ordinary base armor is unaffected by artifact variants.';



CREATE TABLE IF NOT EXISTS "public"."rule_combat_fumbles" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "ruleset" "text" DEFAULT 'dod_expert'::"text" NOT NULL,
    "table_key" "text" NOT NULL,
    "roll_min" smallint NOT NULL,
    "roll_max" smallint NOT NULL,
    "title" "text" NOT NULL,
    "effect_text" "text" DEFAULT ''::"text" NOT NULL,
    "effect_type" "text" NOT NULL,
    "effect_params" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "source_note" "text" DEFAULT 'Drakar och Demoner Expert'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_combat_fumbles_roll_check" CHECK ((("roll_min" >= 1) AND ("roll_min" <= 20) AND (("roll_max" >= 1) AND ("roll_max" <= 20)) AND ("roll_min" <= "roll_max"))),
    CONSTRAINT "rule_combat_fumbles_ruleset_check" CHECK (("ruleset" = 'dod_expert'::"text")),
    CONSTRAINT "rule_combat_fumbles_table_key_check" CHECK (("table_key" = ANY (ARRAY['melee'::"text", 'ranged'::"text", 'natural'::"text"])))
);


ALTER TABLE "public"."rule_combat_fumbles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_combat_round_backgrounds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "image_path" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "archived_at" timestamp with time zone,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "round_background_image_path_check" CHECK ((("image_path" = 'assets/combat/round-hero-battle-pilot.avif'::"text") OR ("image_path" ~ '^assets/combat/round/[a-z0-9-]+\.webp$'::"text") OR (("image_path" ~ '^round/[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$'::"text") AND ("split_part"("split_part"("image_path", '/'::"text", 2), '.'::"text", 1) = ("id")::"text")))),
    CONSTRAINT "rule_combat_round_backgrounds_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 120)))
);


ALTER TABLE "public"."rule_combat_round_backgrounds" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_effects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "polarity" "text" DEFAULT 'neutral'::"text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "default_duration_rounds" integer,
    "stacking" "text" DEFAULT 'refresh'::"text" NOT NULL,
    "modifiers" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target_type" "text" DEFAULT 'combatant'::"text" NOT NULL,
    "duration_unit" "text" DEFAULT 'round'::"text" NOT NULL,
    "expiration_condition" "text" DEFAULT 'duration'::"text" NOT NULL,
    "parameter_schema" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "rule_effects_default_duration_rounds_check" CHECK ((("default_duration_rounds" IS NULL) OR ("default_duration_rounds" >= 0))),
    CONSTRAINT "rule_effects_duration_unit_check" CHECK (("duration_unit" = ANY (ARRAY['round'::"text", 'minute'::"text", 'hour'::"text", 'instant'::"text", 'permanent'::"text"]))),
    CONSTRAINT "rule_effects_expiration_condition_check" CHECK (("expiration_condition" = ANY (ARRAY['duration'::"text", 'manual'::"text", 'woken'::"text", 'cured'::"text", 'dispelled'::"text", 'concentration'::"text", 'special'::"text"]))),
    CONSTRAINT "rule_effects_polarity_check" CHECK (("polarity" = ANY (ARRAY['positive'::"text", 'negative'::"text", 'neutral'::"text"]))),
    CONSTRAINT "rule_effects_stacking_check" CHECK (("stacking" = ANY (ARRAY['refresh'::"text", 'stack'::"text", 'replace'::"text", 'ignore'::"text"]))),
    CONSTRAINT "rule_effects_target_type_check" CHECK (("target_type" = ANY (ARRAY['combatant'::"text", 'hex'::"text", 'area'::"text", 'item'::"text", 'self'::"text"])))
);


ALTER TABLE "public"."rule_effects" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_hit_figure_images" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "race_id" "text" NOT NULL,
    "gender" "text" NOT NULL,
    "body_part" "text" NOT NULL,
    "image_path" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid" DEFAULT "auth"."uid"(),
    CONSTRAINT "rule_hit_figure_images_body_part_check" CHECK (("body_part" = ANY (ARRAY['neutral'::"text", 'head'::"text", 'chest'::"text", 'abdomen'::"text", 'left_arm'::"text", 'right_arm'::"text", 'left_leg'::"text", 'right_leg'::"text"]))),
    CONSTRAINT "rule_hit_figure_images_gender_check" CHECK (("gender" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "rule_hit_figure_images_image_path_check" CHECK (("image_path" ~ '^figure/[0-9a-f-]{36}\.webp$'::"text"))
);


ALTER TABLE "public"."rule_hit_figure_images" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_inn_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_key" "text" NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "price_amount" integer NOT NULL,
    "price_currency" "text" NOT NULL,
    "unit_label" "text" DEFAULT ''::"text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_inn_items_category_check" CHECK (("category" = ANY (ARRAY['Boende'::"text", 'Mat & dryck'::"text", 'Tjänster'::"text"]))),
    CONSTRAINT "rule_inn_items_price_amount_check" CHECK (("price_amount" >= 0)),
    CONSTRAINT "rule_inn_items_price_currency_check" CHECK (("price_currency" = ANY (ARRAY['GM'::"text", 'SM'::"text", 'KM'::"text"])))
);


ALTER TABLE "public"."rule_inn_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_magic_artifact_powers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artifact_id" "uuid" NOT NULL,
    "property_id" "uuid" NOT NULL,
    "spell_id" "uuid",
    "activation" "text" DEFAULT 'action'::"text" NOT NULL,
    "effect_grade" integer DEFAULT 1 NOT NULL,
    "psy_source" "text" DEFAULT 'artifact'::"text" NOT NULL,
    "charge_cost" integer DEFAULT 0 NOT NULL,
    "uses_per_day" integer,
    "target_attribute" "text" DEFAULT ''::"text" NOT NULL,
    "bonus_value" integer DEFAULT 0 NOT NULL,
    "duration_text" "text" DEFAULT ''::"text" NOT NULL,
    "target_text" "text" DEFAULT ''::"text" NOT NULL,
    "details" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "effect_multiplier" integer DEFAULT 1 NOT NULL,
    "cast_mode" "text" DEFAULT 'fixed'::"text" NOT NULL,
    "fixed_fv" integer,
    "recharge_rule" "text" DEFAULT 'none'::"text" NOT NULL,
    "battery_grade_mode" "text" DEFAULT 'chosen'::"text" NOT NULL,
    "battery_grade_dice" "text" DEFAULT '1T3'::"text" NOT NULL,
    CONSTRAINT "rule_magic_artifact_powers_activation_check" CHECK (("activation" = ANY (ARRAY['passive'::"text", 'action'::"text", 'reaction'::"text", 'trigger'::"text"]))),
    CONSTRAINT "rule_magic_artifact_powers_battery_grade_dice_check" CHECK ((("length"("battery_grade_dice") >= 2) AND ("length"("battery_grade_dice") <= 16))),
    CONSTRAINT "rule_magic_artifact_powers_battery_grade_mode_check" CHECK (("battery_grade_mode" = ANY (ARRAY['chosen'::"text", 'dice'::"text"]))),
    CONSTRAINT "rule_magic_artifact_powers_cast_mode_check" CHECK (("cast_mode" = ANY (ARRAY['wearer'::"text", 'fixed'::"text", 'automatic'::"text", 'none'::"text"]))),
    CONSTRAINT "rule_magic_artifact_powers_charge_cost_check" CHECK ((("charge_cost" >= 0) AND ("charge_cost" <= 1000))),
    CONSTRAINT "rule_magic_artifact_powers_effect_grade_check" CHECK ((("effect_grade" >= 1) AND ("effect_grade" <= 50))),
    CONSTRAINT "rule_magic_artifact_powers_effect_multiplier_check" CHECK ((("effect_multiplier" >= 1) AND ("effect_multiplier" <= 1000))),
    CONSTRAINT "rule_magic_artifact_powers_fixed_fv_check" CHECK ((("fixed_fv" >= 1) AND ("fixed_fv" <= 100))),
    CONSTRAINT "rule_magic_artifact_powers_psy_source_check" CHECK (("psy_source" = ANY (ARRAY['artifact'::"text", 'wearer'::"text", 'none'::"text"]))),
    CONSTRAINT "rule_magic_artifact_powers_recharge_rule_check" CHECK (("recharge_rule" = ANY (ARRAY['none'::"text", 'next_day'::"text", 'manual'::"text"]))),
    CONSTRAINT "rule_magic_artifact_powers_uses_per_day_check" CHECK ((("uses_per_day" IS NULL) OR ("uses_per_day" >= 0)))
);


ALTER TABLE "public"."rule_magic_artifact_powers" OWNER TO "postgres";


COMMENT ON TABLE "public"."rule_magic_artifact_powers" IS 'Reusable power configuration. Individual battery contents live solely on the owning character item.';



COMMENT ON COLUMN "public"."rule_magic_artifact_powers"."psy_source" IS 'Design setting for later runtime: artifact pool, wearer PSY or no PSY cost; do not modify current magic rules automatically.';



COMMENT ON COLUMN "public"."rule_magic_artifact_powers"."effect_multiplier" IS 'Generic output multiplier, independent of effect_grade: e.g. EG1 x4 yields four EG1 summons, NOT EG4.';



COMMENT ON COLUMN "public"."rule_magic_artifact_powers"."recharge_rule" IS 'A template rule; next_day checks the campaign day number on the owning individual item and is not a wall-clock delay.';



COMMENT ON COLUMN "public"."rule_magic_artifact_powers"."battery_grade_mode" IS 'Chosen: charger selects EG; dice: evaluate battery_grade_dice at charging time.';



COMMENT ON COLUMN "public"."rule_magic_artifact_powers"."battery_grade_dice" IS 'EG dice notation, e.g. 1T3, only interpreted when battery_grade_mode=dice.';



CREATE TABLE IF NOT EXISTS "public"."rule_magic_artifacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "artifact_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "item_type" "text" DEFAULT 'other'::"text" NOT NULL,
    "base_kind" "text",
    "base_item_id" "uuid",
    "appearance" "text" DEFAULT ''::"text" NOT NULL,
    "magic_properties" "text" DEFAULT ''::"text" NOT NULL,
    "activation" "text" DEFAULT ''::"text" NOT NULL,
    "magic_bonus" integer DEFAULT 0 NOT NULL,
    "max_charges" integer,
    "uses_per_day" integer,
    "rarity" "text" DEFAULT 'uncommon'::"text" NOT NULL,
    "value_sm" numeric,
    "gm_notes" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_magic_artifacts_artifact_key_check" CHECK (("artifact_key" ~ '^[a-z][a-z0-9_]{1,79}$'::"text")),
    CONSTRAINT "rule_magic_artifacts_base_kind_check" CHECK (("base_kind" = ANY (ARRAY['weapon'::"text", 'armor'::"text", 'shield'::"text", 'equipment'::"text"]))),
    CONSTRAINT "rule_magic_artifacts_base_pair_check" CHECK (((("base_kind" IS NULL) AND ("base_item_id" IS NULL)) OR (("base_kind" IS NOT NULL) AND ("base_item_id" IS NOT NULL)))),
    CONSTRAINT "rule_magic_artifacts_item_type_check" CHECK (("item_type" = ANY (ARRAY['amulet'::"text", 'ring'::"text", 'weapon'::"text", 'armor'::"text", 'shield'::"text", 'staff'::"text", 'wand'::"text", 'equipment'::"text", 'other'::"text"]))),
    CONSTRAINT "rule_magic_artifacts_max_charges_check" CHECK ((("max_charges" IS NULL) OR ("max_charges" >= 0))),
    CONSTRAINT "rule_magic_artifacts_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 160))),
    CONSTRAINT "rule_magic_artifacts_rarity_check" CHECK (("rarity" = ANY (ARRAY['common'::"text", 'uncommon'::"text", 'rare'::"text", 'legendary'::"text", 'unique'::"text"]))),
    CONSTRAINT "rule_magic_artifacts_uses_per_day_check" CHECK ((("uses_per_day" IS NULL) OR ("uses_per_day" >= 0))),
    CONSTRAINT "rule_magic_artifacts_value_sm_check" CHECK ((("value_sm" IS NULL) OR ("value_sm" >= (0)::numeric)))
);


ALTER TABLE "public"."rule_magic_artifacts" OWNER TO "postgres";


COMMENT ON TABLE "public"."rule_magic_artifacts" IS 'SL-only magic artifact templates; base_item_id is a reference to an ordinary model, not a grant of magic to all instances.';



COMMENT ON COLUMN "public"."rule_magic_artifacts"."base_item_id" IS 'Polymorphic reference to rule_weapons/rule_armor_types/rule_shields/rule_shop_items by base_kind. Checked by editor, not a SQL FK.';



CREATE TABLE IF NOT EXISTS "public"."rule_magic_property_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "property_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "kind" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_magic_property_definitions_kind_check" CHECK (("kind" = ANY (ARRAY['spell'::"text", 'bonus'::"text", 'protection'::"text", 'status'::"text", 'special'::"text"]))),
    CONSTRAINT "rule_magic_property_definitions_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 160))),
    CONSTRAINT "rule_magic_property_definitions_property_key_check" CHECK (("property_key" ~ '^[a-z][a-z0-9_]{1,79}$'::"text"))
);


ALTER TABLE "public"."rule_magic_property_definitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."rule_magic_property_definitions" IS 'Reusable SL-defined power templates, e.g. cast spell, passive bonus, protection or custom effect.';



CREATE TABLE IF NOT EXISTS "public"."rule_magic_schools" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "source_label" "text" DEFAULT 'Drakar och Demoner Expert'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rule_magic_schools" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_magic_symbols" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "symbol_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "school_value" integer NOT NULL,
    "range_text" "text" DEFAULT ''::"text" NOT NULL,
    "duration_text" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "source_label" "text" DEFAULT 'Drakar och Demoner Expert – Magiboken'::"text" NOT NULL,
    "canonical_expert" boolean DEFAULT true NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon_path" "text",
    "effect_per_eg" "text",
    "resistance_text" "text",
    "description" "text",
    "psy_cost_text" "text",
    "target_text" "text",
    "effect_image_path" "text",
    "cutout_path" "text",
    "illustration_path" "text",
    "illustration_wide_path" "text",
    CONSTRAINT "rule_magic_symbols_school_value_check" CHECK (("school_value" >= 0))
);


ALTER TABLE "public"."rule_magic_symbols" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_magic_symbols"."icon_path" IS 'HERMES published 640px WebP spell/symbol icon path; null when no icon is assigned.';



CREATE TABLE IF NOT EXISTS "public"."rule_professions" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rule_professions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_projectile_types" (
    "projectile_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "recovery_percent" integer DEFAULT 85 NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "image_path" "text",
    "combat_crop_quadrant" "text" DEFAULT 'top-right'::"text" NOT NULL,
    CONSTRAINT "rule_projectile_image_path_check" CHECK ((("image_path" IS NULL) OR (("image_path" ~ '^projectile/[a-z][a-z0-9_]{1,50}/[0-9a-f-]{36}\.(webp|png)$'::"text") AND ("split_part"("image_path", '/'::"text", 2) = "projectile_key")))),
    CONSTRAINT "rule_projectile_types_crop_quadrant_ck" CHECK (("combat_crop_quadrant" = ANY (ARRAY['top-right'::"text", 'top-left'::"text", 'bottom-right'::"text", 'bottom-left'::"text", 'full'::"text"]))),
    CONSTRAINT "rule_projectile_types_projectile_key_check" CHECK (("projectile_key" ~ '^[a-z][a-z0-9_]{1,50}$'::"text")),
    CONSTRAINT "rule_projectile_types_recovery_percent_check" CHECK ((("recovery_percent" >= 0) AND ("recovery_percent" <= 100)))
);


ALTER TABLE "public"."rule_projectile_types" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_projectile_types"."image_path" IS 'Public equipment artwork at projectile/<projectile_key>/<file_uuid>.webp or .png';



CREATE TABLE IF NOT EXISTS "public"."rule_race_attributes" (
    "race_id" "text" NOT NULL,
    "attribute_key" "text" NOT NULL,
    "roll_formula" "text",
    "typical_value" integer,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "source_rule" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "rule_race_attributes_attribute_key_check" CHECK (("attribute_key" = ANY (ARRAY['STY'::"text", 'FYS'::"text", 'STO'::"text", 'SMI'::"text", 'INT'::"text", 'PSY'::"text", 'KAR'::"text"]))),
    CONSTRAINT "rule_race_attributes_typical_value_check" CHECK ((("typical_value" IS NULL) OR (("typical_value" >= 0) AND ("typical_value" <= 99))))
);


ALTER TABLE "public"."rule_race_attributes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_races" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rule_races" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_shields" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "shield_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "size_class" "text" NOT NULL,
    "skill_id" "text" DEFAULT 'skoldar'::"text" NOT NULL,
    "absorption" integer,
    "bep" numeric,
    "bv" integer,
    "price" numeric,
    "projectile_block_min" integer DEFAULT 1 NOT NULL,
    "projectile_block_max" integer NOT NULL,
    "passive_coverage" "text" DEFAULT ''::"text" NOT NULL,
    "can_parry_thrown" boolean DEFAULT true NOT NULL,
    "destruction_chance_per_excess" numeric DEFAULT 0.05 NOT NULL,
    "source_label" "text" DEFAULT 'Expert E55'::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "icon_key" "text",
    "image_path" "text",
    "is_magical" boolean DEFAULT false NOT NULL,
    "combat_crop_quadrant" "text" DEFAULT 'top-right'::"text" NOT NULL,
    CONSTRAINT "rule_shields_absorption_check" CHECK ((("absorption" IS NULL) OR ("absorption" >= 0))),
    CONSTRAINT "rule_shields_bep_check" CHECK ((("bep" IS NULL) OR ("bep" >= (0)::numeric))),
    CONSTRAINT "rule_shields_bv_check" CHECK ((("bv" IS NULL) OR ("bv" >= 0))),
    CONSTRAINT "rule_shields_crop_quadrant_ck" CHECK (("combat_crop_quadrant" = ANY (ARRAY['top-right'::"text", 'top-left'::"text", 'bottom-right'::"text", 'bottom-left'::"text", 'full'::"text"]))),
    CONSTRAINT "rule_shields_destruction_chance_per_excess_check" CHECK ((("destruction_chance_per_excess" >= (0)::numeric) AND ("destruction_chance_per_excess" <= (1)::numeric))),
    CONSTRAINT "rule_shields_price_check" CHECK ((("price" IS NULL) OR ("price" >= (0)::numeric))),
    CONSTRAINT "rule_shields_projectile_range_check" CHECK ((("projectile_block_min" >= 1) AND ("projectile_block_max" <= 20) AND ("projectile_block_min" <= "projectile_block_max"))),
    CONSTRAINT "rule_shields_size_class_check" CHECK (("size_class" = ANY (ARRAY['small'::"text", 'medium'::"text", 'large'::"text"])))
);


ALTER TABLE "public"."rule_shields" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_shields"."image_path" IS 'Optional path in alea-equipment-art storage; item inventory display.';



COMMENT ON COLUMN "public"."rule_shields"."is_magical" IS 'Only this shield master type is itself magical. No automatic defense bonuses.';



CREATE TABLE IF NOT EXISTS "public"."rule_shop_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "item_key" "text" NOT NULL,
    "category" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "bep" numeric(8,2),
    "price_amount" integer NOT NULL,
    "price_currency" "text" NOT NULL,
    "purchase_kind" "text" NOT NULL,
    "quantity_per_purchase" integer DEFAULT 1 NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_key" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "can_carry" boolean DEFAULT false NOT NULL,
    "image_path" "text",
    "is_magical" boolean DEFAULT false NOT NULL,
    CONSTRAINT "rule_shop_items_bep_check" CHECK ((("bep" IS NULL) OR ("bep" >= (0)::numeric))),
    CONSTRAINT "rule_shop_items_image_path_check" CHECK ((("image_path" IS NULL) OR (("image_path" ~ '^equipment/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png)$'::"text") AND ("split_part"("image_path", '/'::"text", 2) = ("id")::"text")))),
    CONSTRAINT "rule_shop_items_price_amount_check" CHECK (("price_amount" >= 0)),
    CONSTRAINT "rule_shop_items_price_currency_check" CHECK (("price_currency" = ANY (ARRAY['GM'::"text", 'SM'::"text", 'KM'::"text"]))),
    CONSTRAINT "rule_shop_items_purchase_kind_check" CHECK (("purchase_kind" = ANY (ARRAY['equipment'::"text", 'projectile'::"text", 'armor'::"text", 'shield'::"text", 'transport'::"text"]))),
    CONSTRAINT "rule_shop_items_quantity_per_purchase_check" CHECK (("quantity_per_purchase" > 0))
);


ALTER TABLE "public"."rule_shop_items" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_shop_items"."can_carry" IS 'Can be equipped in a hand slot in Aktuell utrustning (e.g. torch or lantern)';



COMMENT ON COLUMN "public"."rule_shop_items"."image_path" IS 'Shared transparent inventory artwork: equipment/<item uuid>/<image uuid>.webp';



COMMENT ON COLUMN "public"."rule_shop_items"."is_magical" IS 'Only this equipment master item is itself magical. No automatic spell bonuses.';



CREATE TABLE IF NOT EXISTS "public"."rule_skills" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" NOT NULL,
    "base_attribute" "text" NOT NULL,
    "cost" integer NOT NULL,
    "bc" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "expert_category" "text" DEFAULT 'A'::"text" NOT NULL,
    "icon_path" "text",
    "illustration_path" "text",
    "illustration_wide_path" "text",
    CONSTRAINT "rule_skills_base_attribute_check" CHECK (("base_attribute" = ANY (ARRAY['STY'::"text", 'FYS'::"text", 'STO'::"text", 'SMI'::"text", 'INT'::"text", 'PSY'::"text", 'KAR'::"text"]))),
    CONSTRAINT "rule_skills_bc_check" CHECK (("bc" = ANY (ARRAY['0'::"text", 'STY'::"text", 'FYS'::"text", 'STO'::"text", 'SMI'::"text", 'INT'::"text", 'PSY'::"text", 'KAR'::"text"]))),
    CONSTRAINT "rule_skills_cost_check" CHECK (("cost" >= 0)),
    CONSTRAINT "rule_skills_expert_category_check" CHECK (("expert_category" = ANY (ARRAY['A'::"text", 'B'::"text"]))),
    CONSTRAINT "rule_skills_icon_path_scoped" CHECK ((("icon_path" IS NULL) OR (("icon_path" ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/icon/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp)$'::"text") AND ("split_part"("icon_path", '/'::"text", 2) = "id")) OR (("icon_path" ~ '^hermes/skill/[a-z0-9]+(-[a-z0-9]+)*/[0-9a-f]{64}[.]webp$'::"text") AND ("split_part"("icon_path", '/'::"text", 3) = "replace"("id", '_'::"text", '-'::"text"))))),
    CONSTRAINT "rule_skills_illustration_path_scoped" CHECK ((("illustration_path" IS NULL) OR (("illustration_path" ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/illustration/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg)$'::"text") AND ("split_part"("illustration_path", '/'::"text", 2) = "id")))),
    CONSTRAINT "rule_skills_illustration_wide_path_scoped" CHECK ((("illustration_wide_path" IS NULL) OR (("illustration_wide_path" ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/illustration_wide/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg)$'::"text") AND ("split_part"("illustration_wide_path", '/'::"text", 2) = "id"))))
);


ALTER TABLE "public"."rule_skills" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_skills"."expert_category" IS 'Drakar och Demoner Expert advancement category A or B. Admin-set, defaults to A.';



COMMENT ON COLUMN "public"."rule_skills"."icon_path" IS 'Skill icon: private alea-skill-art manual-upload image OR verified HERMES content-addressed public WebP.';



COMMENT ON COLUMN "public"."rule_skills"."illustration_path" IS 'FÄRDIGHET ILLUSTRATION: immutable square high-fantasy image in private alea-skill-art bucket.';



COMMENT ON COLUMN "public"."rule_skills"."illustration_wide_path" IS 'FÄRDIGHET ILLUSTRATION WIDE: 16:9 high-fantasy original, private alea-skill-art, independent of square illustration_path.';



CREATE TABLE IF NOT EXISTS "public"."rule_social_stands" (
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "ruleset" "text" DEFAULT 'dod_expert'::"text" NOT NULL,
    "human_roll_min" smallint,
    "human_roll_max" smallint,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "rule_social_stands_roll_check" CHECK (((("human_roll_min" IS NULL) AND ("human_roll_max" IS NULL)) OR (("human_roll_min" >= 1) AND ("human_roll_min" <= 20) AND (("human_roll_max" >= 1) AND ("human_roll_max" <= 20)) AND ("human_roll_min" <= "human_roll_max")))),
    CONSTRAINT "rule_social_stands_ruleset_check" CHECK (("ruleset" = 'dod_expert'::"text"))
);


ALTER TABLE "public"."rule_social_stands" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_sound_cues" (
    "cue_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "asset_path" "text",
    "volume" numeric(4,3) DEFAULT 0.65 NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "priority" smallint DEFAULT 2 NOT NULL,
    "sound_kind" "text" DEFAULT 'oneshot'::"text" NOT NULL,
    "usage_hint" "text" DEFAULT ''::"text" NOT NULL,
    "search_terms" "text" DEFAULT ''::"text" NOT NULL,
    "target_variants" smallint DEFAULT 1 NOT NULL,
    "integration_status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "source_status" "text" DEFAULT 'needed'::"text" NOT NULL,
    "source_url" "text",
    "creator_credit" "text",
    "license_type" "text",
    "license_notes" "text",
    CONSTRAINT "rule_sound_cues_asset_path_check" CHECK ((("asset_path" IS NULL) OR (("length"("asset_path") >= 1) AND ("length"("asset_path") <= 240) AND ("asset_path" !~ '[?#]'::"text")))),
    CONSTRAINT "rule_sound_cues_category_check" CHECK (("category" = ANY (ARRAY['dice'::"text", 'melee'::"text", 'ranged'::"text", 'magic'::"text", 'ambience'::"text", 'creature'::"text", 'event'::"text"]))),
    CONSTRAINT "rule_sound_cues_cue_key_check" CHECK (("cue_key" ~ '^[a-z][a-z0-9_.-]{1,79}$'::"text")),
    CONSTRAINT "rule_sound_cues_integration_status_check" CHECK (("integration_status" = ANY (ARRAY['connected'::"text", 'planned'::"text"]))),
    CONSTRAINT "rule_sound_cues_priority_check" CHECK ((("priority" >= 1) AND ("priority" <= 3))),
    CONSTRAINT "rule_sound_cues_sound_kind_check" CHECK (("sound_kind" = ANY (ARRAY['loop'::"text", 'oneshot'::"text"]))),
    CONSTRAINT "rule_sound_cues_source_status_check" CHECK (("source_status" = ANY (ARRAY['needed'::"text", 'shortlisted'::"text", 'verified'::"text"]))),
    CONSTRAINT "rule_sound_cues_target_variants_check" CHECK ((("target_variants" >= 1) AND ("target_variants" <= 8))),
    CONSTRAINT "rule_sound_cues_title_check" CHECK ((("length"("title") >= 1) AND ("length"("title") <= 120))),
    CONSTRAINT "rule_sound_cues_volume_check" CHECK ((("volume" >= (0)::numeric) AND ("volume" <= (1)::numeric)))
);


ALTER TABLE "public"."rule_sound_cues" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_spells" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spell_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "school_id" "text",
    "school_value" integer DEFAULT 1 NOT NULL,
    "range_text" "text" DEFAULT ''::"text" NOT NULL,
    "duration_text" "text" DEFAULT ''::"text" NOT NULL,
    "psy_cost_text" "text" DEFAULT '1 PSY per EG'::"text" NOT NULL,
    "target_text" "text" DEFAULT ''::"text" NOT NULL,
    "effect_per_eg" "text" DEFAULT ''::"text" NOT NULL,
    "resistance_text" "text" DEFAULT ''::"text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "source_label" "text" DEFAULT 'Drakar och Demoner Expert'::"text" NOT NULL,
    "canonical_expert" boolean DEFAULT false NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "attack_magic" boolean DEFAULT false NOT NULL,
    "damage_text" "text",
    "kvick" boolean DEFAULT false NOT NULL,
    "fysisk" boolean DEFAULT false NOT NULL,
    "ritual" boolean DEFAULT false NOT NULL,
    "playtested" boolean DEFAULT false NOT NULL,
    "image_path" "text",
    "image_focus_x" integer DEFAULT 80 NOT NULL,
    "image_focus_y" integer DEFAULT 78 NOT NULL,
    "icon_path" "text",
    "effect_image_path" "text",
    "icon_focus_x" integer DEFAULT 50 NOT NULL,
    "icon_focus_y" integer DEFAULT 50 NOT NULL,
    "icon_zoom" integer DEFAULT 120 NOT NULL,
    "effect_focus_x" integer DEFAULT 50 NOT NULL,
    "effect_focus_y" integer DEFAULT 50 NOT NULL,
    "effect_zoom" integer DEFAULT 120 NOT NULL,
    "cutout_path" "text",
    "cutout_x" integer DEFAULT 50 NOT NULL,
    "cutout_y" integer DEFAULT 90 NOT NULL,
    "cutout_scale" integer DEFAULT 160 NOT NULL,
    "projectile_animation_key" "text",
    "impact_animation_key" "text",
    "illustration_wide_path" "text",
    "illustration_path" "text",
    "target_type" "text" DEFAULT 'other'::"text" NOT NULL,
    CONSTRAINT "rule_spells_cutout_path_scoped" CHECK ((("cutout_path" IS NULL) OR (("cutout_path" ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::"text") AND ("split_part"("cutout_path", '/'::"text", 2) = ("id")::"text")))),
    CONSTRAINT "rule_spells_cutout_position_bounds" CHECK ((("cutout_x" >= 0) AND ("cutout_x" <= 100) AND (("cutout_y" >= 0) AND ("cutout_y" <= 100)) AND (("cutout_scale" >= 50) AND ("cutout_scale" <= 250)))),
    CONSTRAINT "rule_spells_dual_art_crop_bounds" CHECK ((("icon_focus_x" >= 0) AND ("icon_focus_x" <= 100) AND (("icon_focus_y" >= 0) AND ("icon_focus_y" <= 100)) AND (("effect_focus_x" >= 0) AND ("effect_focus_x" <= 100)) AND (("effect_focus_y" >= 0) AND ("effect_focus_y" <= 100)) AND (("icon_zoom" >= 100) AND ("icon_zoom" <= 300)) AND (("effect_zoom" >= 100) AND ("effect_zoom" <= 300)))),
    CONSTRAINT "rule_spells_dual_art_paths" CHECK (((("icon_path" IS NULL) OR (("icon_path" ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'::"text") AND ("split_part"("icon_path", '/'::"text", 2) = ("id")::"text")) OR ("icon_path" = (('assets/spells/arcane-ivory/'::"text" || "spell_key") || '.png'::"text")) OR ("icon_path" = (('assets/spells/arcane-ivory/'::"text" || "spell_key") || '.webp'::"text")) OR (("icon_path" ~ '^hermes/spell/[a-z0-9]+(-[a-z0-9]+)*/[a-f0-9]{64}[.]webp$'::"text") AND ("split_part"("icon_path", '/'::"text", 3) = "spell_key"))) AND (("effect_image_path" IS NULL) OR (("effect_image_path" ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'::"text") AND ("split_part"("effect_image_path", '/'::"text", 2) = ("id")::"text"))))),
    CONSTRAINT "rule_spells_illustration_path_scoped" CHECK ((("illustration_path" IS NULL) OR (("illustration_path" ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'::"text") AND ("split_part"("illustration_path", '/'::"text", 2) = ("id")::"text")))),
    CONSTRAINT "rule_spells_illustration_wide_path_scoped" CHECK ((("illustration_wide_path" IS NULL) OR (("illustration_wide_path" ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}[.]webp$'::"text") AND ("split_part"("illustration_wide_path", '/'::"text", 2) = ("id")::"text")))),
    CONSTRAINT "rule_spells_image_focus_bounds" CHECK ((("image_focus_x" >= 0) AND ("image_focus_x" <= 100) AND (("image_focus_y" >= 0) AND ("image_focus_y" <= 100)))),
    CONSTRAINT "rule_spells_image_path_scoped" CHECK ((("image_path" IS NULL) OR (("image_path" ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'::"text") AND ("split_part"("image_path", '/'::"text", 2) = ("id")::"text")))),
    CONSTRAINT "rule_spells_school_value_check" CHECK (("school_value" >= 0)),
    CONSTRAINT "rule_spells_target_type_check" CHECK (("target_type" = ANY (ARRAY['combatant'::"text", 'hexagon'::"text", 'other'::"text"])))
);


ALTER TABLE "public"."rule_spells" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_spells"."image_path" IS 'Private immutable WebP path spell/<spell uuid>/<image uuid>.webp, used as a combat-action snapshot.';



COMMENT ON COLUMN "public"."rule_spells"."image_focus_x" IS 'Horizontal background crop focus, percent.';



COMMENT ON COLUMN "public"."rule_spells"."image_focus_y" IS 'Vertical background crop focus, percent.';



COMMENT ON COLUMN "public"."rule_spells"."icon_path" IS 'Either legacy private WebP or spell-matched ARCANE IVORY PNG or WebP GitHub asset.';



COMMENT ON COLUMN "public"."rule_spells"."effect_image_path" IS 'Square-cropped spell effect artwork, privately stored; combat action snapshots preserve this file path.';



COMMENT ON COLUMN "public"."rule_spells"."icon_zoom" IS 'Icon crop zoom in percent, 100..300.';



COMMENT ON COLUMN "public"."rule_spells"."effect_zoom" IS 'Effect art crop zoom in percent, 100..300.';



COMMENT ON COLUMN "public"."rule_spells"."cutout_path" IS 'Optional transparent WebP cutout shown above combat center gold frame; not inherited from other spell images.';



COMMENT ON COLUMN "public"."rule_spells"."cutout_x" IS 'Horizontal cutout anchor, percent of frame width.';



COMMENT ON COLUMN "public"."rule_spells"."cutout_y" IS 'Cutout image baseline, percent of frame height.';



COMMENT ON COLUMN "public"."rule_spells"."cutout_scale" IS 'Cutout proportion-preserving size, 50..250 percent.';



COMMENT ON COLUMN "public"."rule_spells"."projectile_animation_key" IS 'Optional HERMES cue for travelling projectile; only visual.';



COMMENT ON COLUMN "public"."rule_spells"."impact_animation_key" IS 'Optional HERMES cue for impact effect; only visual.';



COMMENT ON COLUMN "public"."rule_spells"."illustration_wide_path" IS 'BESVÄRJELSE ILLUSTRATION WIDE: original aspect ratio landscape illustration; private immutable WebP in alea-spell-art, independent from icon/effect/cutout.';



COMMENT ON COLUMN "public"."rule_spells"."illustration_path" IS 'BESVÄRJELSE ILLUSTRATION: opaque square 1:1 full-frame image in private alea-spell-art, distinct from ARCANE IVORY icon, effect, cutout and WIDE. Unlinking does not delete immutable assets.';



COMMENT ON COLUMN "public"."rule_spells"."target_type" IS 'Target mode used by admin and combat flows: combatant, hexagon, or other.';



CREATE TABLE IF NOT EXISTS "public"."rule_weapon_materials" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "material_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_default" boolean DEFAULT false NOT NULL,
    "allowed_any_tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "rules" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rule_weapon_materials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rule_weapons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "category" "text" NOT NULL,
    "handling" "text" NOT NULL,
    "strength_group" integer NOT NULL,
    "name" "text" NOT NULL,
    "damage" "text" DEFAULT ''::"text" NOT NULL,
    "weapon_length" integer,
    "bep" numeric(8,2) DEFAULT 0 NOT NULL,
    "bv" integer,
    "weapon_type" "text" DEFAULT ''::"text" NOT NULL,
    "price" numeric(10,2),
    "range_text" "text" DEFAULT ''::"text" NOT NULL,
    "reload_rounds" integer,
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "tags" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "skill_id" "text" NOT NULL,
    "icon_key" "text" DEFAULT 'generic'::"text" NOT NULL,
    "projectile_key" "text",
    "image_path" "text",
    "is_magical" boolean DEFAULT false NOT NULL,
    "combat_crop_quadrant" "text" DEFAULT 'top-right'::"text" NOT NULL,
    "weapon_class" "text",
    CONSTRAINT "rule_weapons_bep_check" CHECK (("bep" >= (0)::numeric)),
    CONSTRAINT "rule_weapons_category_check" CHECK (("category" = ANY (ARRAY['melee'::"text", 'projectile'::"text", 'thrown'::"text"]))),
    CONSTRAINT "rule_weapons_crop_quadrant_ck" CHECK (("combat_crop_quadrant" = ANY (ARRAY['top-right'::"text", 'top-left'::"text", 'bottom-right'::"text", 'bottom-left'::"text", 'full'::"text"]))),
    CONSTRAINT "rule_weapons_handling_check" CHECK (("handling" = ANY (ARRAY['1H'::"text", '1-2H'::"text", '2H'::"text"]))),
    CONSTRAINT "rule_weapons_icon_key_nonblank" CHECK (("btrim"("icon_key") <> ''::"text")),
    CONSTRAINT "rule_weapons_price_check" CHECK ((("price" IS NULL) OR ("price" >= (0)::numeric))),
    CONSTRAINT "rule_weapons_ranged_ammo_required" CHECK ((("category" <> ALL (ARRAY['projectile'::"text", 'thrown'::"text"])) OR ("projectile_key" IS NOT NULL))),
    CONSTRAINT "rule_weapons_reload_rounds_check" CHECK ((("reload_rounds" IS NULL) OR ("reload_rounds" >= 0))),
    CONSTRAINT "rule_weapons_strength_group_check" CHECK (("strength_group" >= 0)),
    CONSTRAINT "rule_weapons_weapon_length_check" CHECK ((("weapon_length" IS NULL) OR ("weapon_length" >= 0)))
);


ALTER TABLE "public"."rule_weapons" OWNER TO "postgres";


COMMENT ON COLUMN "public"."rule_weapons"."image_path" IS 'Optional path in alea-equipment-art storage; item inventory display.';



COMMENT ON COLUMN "public"."rule_weapons"."is_magical" IS 'Only this weapon master type is itself magical. Does not inherit from artifact templates using it as their base.';



ALTER TABLE ONLY "private"."hermes_alea_settings"
    ADD CONSTRAINT "hermes_alea_settings_pkey" PRIMARY KEY ("singleton");



ALTER TABLE ONLY "public"."arcane_system_assets"
    ADD CONSTRAINT "arcane_system_assets_asset_key_key" UNIQUE ("asset_key");



ALTER TABLE ONLY "public"."arcane_system_assets"
    ADD CONSTRAINT "arcane_system_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_audio_events"
    ADD CONSTRAINT "campaign_audio_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_audio_state"
    ADD CONSTRAINT "campaign_audio_state_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."campaign_combat_scene_combatants"
    ADD CONSTRAINT "campaign_combat_scene_combatants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_day_history"
    ADD CONSTRAINT "campaign_day_history_campaign_id_day_number_key" UNIQUE ("campaign_id", "day_number");



ALTER TABLE ONLY "public"."campaign_day_history"
    ADD CONSTRAINT "campaign_day_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_day_state"
    ADD CONSTRAINT "campaign_day_state_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."campaign_event_combat_hexes"
    ADD CONSTRAINT "campaign_event_combat_hexes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_event_combat_hexes"
    ADD CONSTRAINT "campaign_event_combat_hexes_unique" UNIQUE ("event_id", "q", "r");



ALTER TABLE ONLY "public"."campaign_combat_scene_characters"
    ADD CONSTRAINT "campaign_event_combat_scene_characters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_combat_scene_characters"
    ADD CONSTRAINT "campaign_event_combat_scene_characters_unique" UNIQUE ("scene_id", "character_id");



ALTER TABLE ONLY "public"."campaign_combat_scene_hexes"
    ADD CONSTRAINT "campaign_event_combat_scene_hexes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_combat_scene_hexes"
    ADD CONSTRAINT "campaign_event_combat_scene_hexes_unique" UNIQUE ("scene_id", "q", "r");



ALTER TABLE ONLY "public"."campaign_combat_scene_monsters"
    ADD CONSTRAINT "campaign_event_combat_scene_monsters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_combat_scene_monsters"
    ADD CONSTRAINT "campaign_event_combat_scene_monsters_unique" UNIQUE ("scene_id", "monster_id");



ALTER TABLE ONLY "public"."campaign_combat_scene_npcs"
    ADD CONSTRAINT "campaign_event_combat_scene_npcs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_combat_scene_npcs"
    ADD CONSTRAINT "campaign_event_combat_scene_npcs_unique" UNIQUE ("scene_id", "npc_id");



ALTER TABLE ONLY "public"."campaign_combat_scenes"
    ADD CONSTRAINT "campaign_event_combat_scenes_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_combat_scenes"
    ADD CONSTRAINT "campaign_event_combat_scenes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_event_combat_spawns"
    ADD CONSTRAINT "campaign_event_combat_spawns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_event_combats"
    ADD CONSTRAINT "campaign_event_combats_pkey" PRIMARY KEY ("event_id");



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_unique" UNIQUE ("event_id", "monster_id");



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_image_links"
    ADD CONSTRAINT "campaign_image_links_image_id_object_type_object_id_key" UNIQUE ("image_id", "object_type", "object_id");



ALTER TABLE ONLY "public"."campaign_image_links"
    ADD CONSTRAINT "campaign_image_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_images"
    ADD CONSTRAINT "campaign_images_campaign_id_storage_bucket_storage_path_key" UNIQUE ("campaign_id", "storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."campaign_images"
    ADD CONSTRAINT "campaign_images_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_images"
    ADD CONSTRAINT "campaign_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_journal_entries"
    ADD CONSTRAINT "campaign_journal_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_journal_entries"
    ADD CONSTRAINT "campaign_journal_entries_source_key_key" UNIQUE ("source_key");



ALTER TABLE ONLY "public"."campaign_location_assets"
    ADD CONSTRAINT "campaign_location_assets_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_location_event_links"
    ADD CONSTRAINT "campaign_location_event_links_pkey" PRIMARY KEY ("location_id", "event_id");



ALTER TABLE ONLY "public"."campaign_location_events"
    ADD CONSTRAINT "campaign_location_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_location_gm_notes"
    ADD CONSTRAINT "campaign_location_gm_notes_pkey" PRIMARY KEY ("location_id");



ALTER TABLE ONLY "public"."campaign_location_monster_links"
    ADD CONSTRAINT "campaign_location_monster_links_pkey" PRIMARY KEY ("location_id", "monster_id");



ALTER TABLE ONLY "public"."campaign_location_npc_links"
    ADD CONSTRAINT "campaign_location_npc_links_pkey" PRIMARY KEY ("location_id", "npc_id");



ALTER TABLE ONLY "public"."campaign_location_player_texts"
    ADD CONSTRAINT "campaign_location_player_texts_pkey" PRIMARY KEY ("location_id");



ALTER TABLE ONLY "public"."campaign_location_state"
    ADD CONSTRAINT "campaign_location_state_pkey" PRIMARY KEY ("location_id");



ALTER TABLE ONLY "public"."campaign_locations"
    ADD CONSTRAINT "campaign_locations_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_locations"
    ADD CONSTRAINT "campaign_locations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_map_areas"
    ADD CONSTRAINT "campaign_map_areas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_map_settings"
    ADD CONSTRAINT "campaign_map_settings_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."campaign_map_signals"
    ADD CONSTRAINT "campaign_map_signals_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."campaign_maps"
    ADD CONSTRAINT "campaign_maps_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_maps"
    ADD CONSTRAINT "campaign_maps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_material_gm_notes"
    ADD CONSTRAINT "campaign_material_gm_notes_pkey" PRIMARY KEY ("material_id");



ALTER TABLE ONLY "public"."campaign_material_links"
    ADD CONSTRAINT "campaign_material_links_one_per_entity" UNIQUE ("campaign_id", "material_id", "entity_type", "entity_id");



ALTER TABLE ONLY "public"."campaign_material_links"
    ADD CONSTRAINT "campaign_material_links_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_material_presentation_history"
    ADD CONSTRAINT "campaign_material_presentation_history_pkey" PRIMARY KEY ("campaign_id", "revision");



ALTER TABLE ONLY "public"."campaign_material_presentations"
    ADD CONSTRAINT "campaign_material_presentations_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."campaign_material_shares"
    ADD CONSTRAINT "campaign_material_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_material_signals"
    ADD CONSTRAINT "campaign_material_signals_pkey" PRIMARY KEY ("campaign_id");



ALTER TABLE ONLY "public"."campaign_materials"
    ADD CONSTRAINT "campaign_materials_campaign_id_id_unique" UNIQUE ("campaign_id", "id");



ALTER TABLE ONLY "public"."campaign_materials"
    ADD CONSTRAINT "campaign_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_materials"
    ADD CONSTRAINT "campaign_materials_unique_storage" UNIQUE ("campaign_id", "storage_bucket", "storage_path");



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_pkey" PRIMARY KEY ("campaign_id", "user_id");



ALTER TABLE ONLY "public"."campaign_monsters"
    ADD CONSTRAINT "campaign_monsters_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_monsters"
    ADD CONSTRAINT "campaign_monsters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_npcs"
    ADD CONSTRAINT "campaign_npcs_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_npcs"
    ADD CONSTRAINT "campaign_npcs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaign_sites"
    ADD CONSTRAINT "campaign_sites_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."campaign_sites"
    ADD CONSTRAINT "campaign_sites_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_erf_awards"
    ADD CONSTRAINT "character_erf_awards_campaign_id_character_id_item_group_it_key" UNIQUE ("campaign_id", "character_id", "item_group", "item_key", "erf_cycle");



ALTER TABLE ONLY "public"."character_erf_awards"
    ADD CONSTRAINT "character_erf_awards_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."character_rest_state"
    ADD CONSTRAINT "character_rest_state_pkey" PRIMARY KEY ("character_id");



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_id_campaign_id_key" UNIQUE ("id", "campaign_id");



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combat_actions"
    ADD CONSTRAINT "combat_actions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combat_ammunition_spends"
    ADD CONSTRAINT "combat_ammunition_spends_pkey" PRIMARY KEY ("action_id");



ALTER TABLE ONLY "public"."combat_animation_cues"
    ADD CONSTRAINT "combat_animation_cues_pkey" PRIMARY KEY ("event_key");



ALTER TABLE ONLY "public"."combat_area_effects"
    ADD CONSTRAINT "combat_area_effects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combat_area_events"
    ADD CONSTRAINT "combat_area_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combat_hexes"
    ADD CONSTRAINT "combat_hexes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combat_hexes"
    ADD CONSTRAINT "combat_hexes_unique" UNIQUE ("combat_id", "q", "r");



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combat_log"
    ADD CONSTRAINT "combat_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combatant_battle_poses"
    ADD CONSTRAINT "combatant_battle_poses_combatant_type_combatant_id_pose_key_key" UNIQUE ("combatant_type", "combatant_id", "pose_key");



ALTER TABLE ONLY "public"."combatant_battle_poses"
    ADD CONSTRAINT "combatant_battle_poses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combatant_effects"
    ADD CONSTRAINT "combatant_effects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."combatants"
    ADD CONSTRAINT "combatants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."global_npcs"
    ADD CONSTRAINT "global_npcs_npc_key_key" UNIQUE ("npc_key");



ALTER TABLE ONLY "public"."global_npcs"
    ADD CONSTRAINT "global_npcs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hermes_alea_jobs"
    ADD CONSTRAINT "hermes_alea_jobs_output_path_key" UNIQUE ("output_path");



ALTER TABLE ONLY "public"."hermes_alea_jobs"
    ADD CONSTRAINT "hermes_alea_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hermes_alea_jobs"
    ADD CONSTRAINT "hermes_alea_jobs_requested_by_idempotency_key_key" UNIQUE ("requested_by", "idempotency_key");



ALTER TABLE ONLY "public"."hermes_alea_jobs"
    ADD CONSTRAINT "hermes_alea_jobs_source_path_key" UNIQUE ("source_path");



ALTER TABLE ONLY "public"."hermes_job_events"
    ADD CONSTRAINT "hermes_job_events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hermes_jobs"
    ADD CONSTRAINT "hermes_jobs_kind_target_key_source_sha256_key" UNIQUE ("kind", "target_key", "source_sha256");



ALTER TABLE ONLY "public"."hermes_jobs"
    ADD CONSTRAINT "hermes_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hermes_web_jobs"
    ADD CONSTRAINT "hermes_web_jobs_idempotency_key_key" UNIQUE ("idempotency_key");



ALTER TABLE ONLY "public"."hermes_web_jobs"
    ADD CONSTRAINT "hermes_web_jobs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."hermes_web_jobs"
    ADD CONSTRAINT "hermes_web_jobs_pose_id_source_path_key" UNIQUE ("pose_id", "source_path");



ALTER TABLE ONLY "public"."honor_definitions"
    ADD CONSTRAINT "honor_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."honor_grants"
    ADD CONSTRAINT "honor_grants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."honor_relief_variants"
    ADD CONSTRAINT "honor_relief_variants_honor_id_name_key" UNIQUE ("honor_id", "name");



ALTER TABLE ONLY "public"."honor_relief_variants"
    ADD CONSTRAINT "honor_relief_variants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."race_battle_poses"
    ADD CONSTRAINT "race_battle_poses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."race_battle_poses"
    ADD CONSTRAINT "race_battle_poses_race_id_gender_variant_pose_key_key" UNIQUE ("race_id", "gender_variant", "pose_key");



ALTER TABLE ONLY "public"."rule_armor_materials"
    ADD CONSTRAINT "rule_armor_materials_material_key_key" UNIQUE ("material_key");



ALTER TABLE ONLY "public"."rule_armor_materials"
    ADD CONSTRAINT "rule_armor_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_armor_types"
    ADD CONSTRAINT "rule_armor_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_armor_types"
    ADD CONSTRAINT "rule_armor_types_type_key_key" UNIQUE ("type_key");



ALTER TABLE ONLY "public"."rule_combat_fumbles"
    ADD CONSTRAINT "rule_combat_fumbles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_combat_fumbles"
    ADD CONSTRAINT "rule_combat_fumbles_range_key" UNIQUE ("ruleset", "table_key", "roll_min", "roll_max");



ALTER TABLE ONLY "public"."rule_combat_round_backgrounds"
    ADD CONSTRAINT "rule_combat_round_backgrounds_image_path_key" UNIQUE ("image_path");



ALTER TABLE ONLY "public"."rule_combat_round_backgrounds"
    ADD CONSTRAINT "rule_combat_round_backgrounds_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_effects"
    ADD CONSTRAINT "rule_effects_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."rule_effects"
    ADD CONSTRAINT "rule_effects_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_hit_figure_images"
    ADD CONSTRAINT "rule_hit_figure_images_image_path_key" UNIQUE ("image_path");



ALTER TABLE ONLY "public"."rule_hit_figure_images"
    ADD CONSTRAINT "rule_hit_figure_images_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_hit_figure_images"
    ADD CONSTRAINT "rule_hit_figure_images_race_id_gender_body_part_key" UNIQUE ("race_id", "gender", "body_part");



ALTER TABLE ONLY "public"."rule_inn_items"
    ADD CONSTRAINT "rule_inn_items_item_key_key" UNIQUE ("item_key");



ALTER TABLE ONLY "public"."rule_inn_items"
    ADD CONSTRAINT "rule_inn_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_magic_artifact_powers"
    ADD CONSTRAINT "rule_magic_artifact_powers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_magic_artifacts"
    ADD CONSTRAINT "rule_magic_artifacts_artifact_key_key" UNIQUE ("artifact_key");



ALTER TABLE ONLY "public"."rule_magic_artifacts"
    ADD CONSTRAINT "rule_magic_artifacts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_magic_property_definitions"
    ADD CONSTRAINT "rule_magic_property_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_magic_property_definitions"
    ADD CONSTRAINT "rule_magic_property_definitions_property_key_key" UNIQUE ("property_key");



ALTER TABLE ONLY "public"."rule_magic_schools"
    ADD CONSTRAINT "rule_magic_schools_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."rule_magic_schools"
    ADD CONSTRAINT "rule_magic_schools_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_magic_symbols"
    ADD CONSTRAINT "rule_magic_symbols_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_magic_symbols"
    ADD CONSTRAINT "rule_magic_symbols_symbol_key_key" UNIQUE ("symbol_key");



ALTER TABLE ONLY "public"."rule_professions"
    ADD CONSTRAINT "rule_professions_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."rule_professions"
    ADD CONSTRAINT "rule_professions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_projectile_types"
    ADD CONSTRAINT "rule_projectile_types_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."rule_projectile_types"
    ADD CONSTRAINT "rule_projectile_types_pkey" PRIMARY KEY ("projectile_key");



ALTER TABLE ONLY "public"."rule_race_attributes"
    ADD CONSTRAINT "rule_race_attributes_pkey" PRIMARY KEY ("race_id", "attribute_key");



ALTER TABLE ONLY "public"."rule_races"
    ADD CONSTRAINT "rule_races_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."rule_races"
    ADD CONSTRAINT "rule_races_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_shields"
    ADD CONSTRAINT "rule_shields_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."rule_shields"
    ADD CONSTRAINT "rule_shields_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_shields"
    ADD CONSTRAINT "rule_shields_shield_key_key" UNIQUE ("shield_key");



ALTER TABLE ONLY "public"."rule_shop_items"
    ADD CONSTRAINT "rule_shop_items_item_key_key" UNIQUE ("item_key");



ALTER TABLE ONLY "public"."rule_shop_items"
    ADD CONSTRAINT "rule_shop_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_skills"
    ADD CONSTRAINT "rule_skills_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_social_stands"
    ADD CONSTRAINT "rule_social_stands_name_key" UNIQUE ("name");



ALTER TABLE ONLY "public"."rule_social_stands"
    ADD CONSTRAINT "rule_social_stands_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_sound_cues"
    ADD CONSTRAINT "rule_sound_cues_pkey" PRIMARY KEY ("cue_key");



ALTER TABLE ONLY "public"."rule_spells"
    ADD CONSTRAINT "rule_spells_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_spells"
    ADD CONSTRAINT "rule_spells_spell_key_key" UNIQUE ("spell_key");



ALTER TABLE ONLY "public"."rule_weapon_materials"
    ADD CONSTRAINT "rule_weapon_materials_material_key_key" UNIQUE ("material_key");



ALTER TABLE ONLY "public"."rule_weapon_materials"
    ADD CONSTRAINT "rule_weapon_materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rule_weapons"
    ADD CONSTRAINT "rule_weapons_category_name_key" UNIQUE ("category", "name");



ALTER TABLE ONLY "public"."rule_weapons"
    ADD CONSTRAINT "rule_weapons_pkey" PRIMARY KEY ("id");



CREATE INDEX "campaign_audio_events_recent_idx" ON "public"."campaign_audio_events" USING "btree" ("campaign_id", "created_at" DESC);



CREATE UNIQUE INDEX "campaign_combat_scene_combatants_one_per_start_hex" ON "public"."campaign_combat_scene_combatants" USING "btree" ("scene_id", "start_q", "start_r") WHERE (("start_q" IS NOT NULL) AND ("start_r" IS NOT NULL));



CREATE INDEX "campaign_combat_scene_combatants_scene_idx" ON "public"."campaign_combat_scene_combatants" USING "btree" ("scene_id", "sort_order", "id");



CREATE UNIQUE INDEX "campaign_combat_scene_combatants_source_instance_uidx" ON "public"."campaign_combat_scene_combatants" USING "btree" ("scene_id", "source_type", "source_id", "instance_no") WHERE ("source_id" IS NOT NULL);



CREATE INDEX "campaign_day_history_started_by_idx" ON "public"."campaign_day_history" USING "btree" ("started_by");



CREATE INDEX "campaign_day_state_updated_by_idx" ON "public"."campaign_day_state" USING "btree" ("updated_by");



CREATE INDEX "campaign_event_combat_hexes_event_idx" ON "public"."campaign_event_combat_hexes" USING "btree" ("event_id", "q", "r");



CREATE INDEX "campaign_event_combat_scene_characters_character_idx" ON "public"."campaign_combat_scene_characters" USING "btree" ("character_id");



CREATE INDEX "campaign_event_combat_scene_characters_scene_idx" ON "public"."campaign_combat_scene_characters" USING "btree" ("scene_id", "sort_order");



CREATE INDEX "campaign_event_combat_scene_hexes_scene_idx" ON "public"."campaign_combat_scene_hexes" USING "btree" ("scene_id", "q", "r");



CREATE INDEX "campaign_event_combat_scene_monsters_monster_idx" ON "public"."campaign_combat_scene_monsters" USING "btree" ("monster_id");



CREATE INDEX "campaign_event_combat_scene_monsters_scene_idx" ON "public"."campaign_combat_scene_monsters" USING "btree" ("scene_id", "sort_order");



CREATE INDEX "campaign_event_combat_scene_npcs_npc_idx" ON "public"."campaign_combat_scene_npcs" USING "btree" ("npc_id");



CREATE INDEX "campaign_event_combat_scene_npcs_scene_idx" ON "public"."campaign_combat_scene_npcs" USING "btree" ("scene_id", "sort_order");



CREATE INDEX "campaign_event_combat_scenes_campaign_idx" ON "public"."campaign_combat_scenes" USING "btree" ("campaign_id");



CREATE INDEX "campaign_event_combat_scenes_event_idx" ON "public"."campaign_combat_scenes" USING "btree" ("source_event_id", "sort_order", "name");



CREATE INDEX "campaign_event_combat_scenes_location_idx" ON "public"."campaign_combat_scenes" USING "btree" ("location_id");



CREATE INDEX "campaign_event_combat_scenes_map_idx" ON "public"."campaign_combat_scenes" USING "btree" ("map_id");



CREATE INDEX "campaign_event_combat_spawns_controller_idx" ON "public"."campaign_event_combat_spawns" USING "btree" ("controller_user_id");



CREATE INDEX "campaign_event_combat_spawns_event_idx" ON "public"."campaign_event_combat_spawns" USING "btree" ("event_id", "sort_order");



CREATE INDEX "campaign_event_combats_campaign_idx" ON "public"."campaign_event_combats" USING "btree" ("campaign_id");



CREATE INDEX "campaign_event_combats_event_campaign_idx" ON "public"."campaign_event_combats" USING "btree" ("event_id", "campaign_id");



CREATE INDEX "campaign_event_combats_map_campaign_idx" ON "public"."campaign_event_combats" USING "btree" ("map_id", "campaign_id");



CREATE INDEX "campaign_event_combats_map_idx" ON "public"."campaign_event_combats" USING "btree" ("map_id");



CREATE INDEX "campaign_event_enemies_event_idx" ON "public"."campaign_event_enemies" USING "btree" ("event_id", "sort_order");



CREATE INDEX "campaign_event_enemies_monster_idx" ON "public"."campaign_event_enemies" USING "btree" ("monster_id");



CREATE INDEX "campaign_events_campaign_idx" ON "public"."campaign_events" USING "btree" ("campaign_id", "sort_order", "name");



CREATE INDEX "campaign_image_links_lookup" ON "public"."campaign_image_links" USING "btree" ("campaign_id", "object_type", "object_id", "sort_order");



CREATE UNIQUE INDEX "campaign_image_one_primary" ON "public"."campaign_image_links" USING "btree" ("campaign_id", "object_type", "object_id") WHERE "is_primary";



CREATE INDEX "campaign_journal_recent_idx" ON "public"."campaign_journal_entries" USING "btree" ("campaign_id", "created_at" DESC, "id" DESC);



CREATE INDEX "campaign_location_assets_location_idx" ON "public"."campaign_location_assets" USING "btree" ("location_id", "sort_order");



CREATE INDEX "campaign_location_event_links_campaign_idx" ON "public"."campaign_location_event_links" USING "btree" ("campaign_id");



CREATE INDEX "campaign_location_event_links_event_campaign_idx" ON "public"."campaign_location_event_links" USING "btree" ("event_id", "campaign_id");



CREATE INDEX "campaign_location_event_links_event_idx" ON "public"."campaign_location_event_links" USING "btree" ("event_id");



CREATE INDEX "campaign_location_event_links_location_campaign_idx" ON "public"."campaign_location_event_links" USING "btree" ("location_id", "campaign_id");



CREATE UNIQUE INDEX "campaign_location_event_links_one_primary_per_event" ON "public"."campaign_location_event_links" USING "btree" ("event_id") WHERE ("relation_kind" = 'primary'::"text");



CREATE INDEX "campaign_location_gm_notes_location_idx" ON "public"."campaign_location_gm_notes" USING "btree" ("location_id", "sort_order");



CREATE INDEX "campaign_location_monster_links_monster_idx" ON "public"."campaign_location_monster_links" USING "btree" ("monster_id");



CREATE INDEX "campaign_location_npc_links_npc_idx" ON "public"."campaign_location_npc_links" USING "btree" ("npc_id");



CREATE INDEX "campaign_location_player_texts_location_idx" ON "public"."campaign_location_player_texts" USING "btree" ("location_id", "sort_order");



CREATE UNIQUE INDEX "campaign_locations_key_idx" ON "public"."campaign_locations" USING "btree" ("site_id", "lower"("location_key"));



CREATE INDEX "campaign_locations_site_idx" ON "public"."campaign_locations" USING "btree" ("campaign_id", "site_id", "sort_order");



CREATE INDEX "campaign_map_areas_location_idx" ON "public"."campaign_map_areas" USING "btree" ("location_id");



CREATE INDEX "campaign_map_areas_map_idx" ON "public"."campaign_map_areas" USING "btree" ("campaign_id", "map_id", "sort_order");



CREATE INDEX "campaign_maps_campaign_idx" ON "public"."campaign_maps" USING "btree" ("campaign_id", "player_visible", "sort_order", "name");



CREATE INDEX "campaign_material_links_entity_idx" ON "public"."campaign_material_links" USING "btree" ("campaign_id", "entity_type", "entity_id");



CREATE INDEX "campaign_material_presentation_lookup" ON "public"."campaign_material_presentations" USING "btree" ("material_id") WHERE ("material_id" IS NOT NULL);



CREATE INDEX "campaign_material_shares_active_idx" ON "public"."campaign_material_shares" USING "btree" ("campaign_id", "material_id") WHERE ("revoked_at" IS NULL);



CREATE UNIQUE INDEX "campaign_material_shares_current_unique" ON "public"."campaign_material_shares" USING "btree" ("campaign_id", "material_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "campaign_materials_browse_idx" ON "public"."campaign_materials" USING "btree" ("campaign_id", "category", "title") WHERE ("archived_at" IS NULL);



CREATE INDEX "campaign_monsters_campaign_idx" ON "public"."campaign_monsters" USING "btree" ("campaign_id", "sort_order", "name");



CREATE INDEX "campaign_monsters_kind_idx" ON "public"."campaign_monsters" USING "btree" ("campaign_id", "actor_kind", "sort_order", "name");



CREATE INDEX "campaign_npcs_campaign_idx" ON "public"."campaign_npcs" USING "btree" ("campaign_id", "sort_order", "name");



CREATE INDEX "campaign_npcs_global_source_idx" ON "public"."campaign_npcs" USING "btree" ("source_global_npc_id") WHERE ("source_global_npc_id" IS NOT NULL);



CREATE INDEX "campaign_sites_campaign_idx" ON "public"."campaign_sites" USING "btree" ("campaign_id", "parent_site_id", "sort_order");



CREATE UNIQUE INDEX "campaign_sites_child_key_idx" ON "public"."campaign_sites" USING "btree" ("campaign_id", "parent_site_id", "lower"("site_key")) WHERE ("parent_site_id" IS NOT NULL);



CREATE UNIQUE INDEX "campaign_sites_root_key_idx" ON "public"."campaign_sites" USING "btree" ("campaign_id", "lower"("site_key")) WHERE ("parent_site_id" IS NULL);



CREATE INDEX "character_erf_awards_awarded_by_idx" ON "public"."character_erf_awards" USING "btree" ("awarded_by");



CREATE INDEX "character_erf_awards_character_idx" ON "public"."character_erf_awards" USING "btree" ("character_id", "erf_cycle");



CREATE INDEX "character_rest_state_campaign_idx" ON "public"."character_rest_state" USING "btree" ("campaign_id");



CREATE INDEX "combat_actions_actor_idx" ON "public"."combat_actions" USING "btree" ("combatant_id", "status");



CREATE INDEX "combat_actions_campaign_idx" ON "public"."combat_actions" USING "btree" ("campaign_id");



CREATE INDEX "combat_actions_combat_round_idx" ON "public"."combat_actions" USING "btree" ("combat_id", "round_number", "phase", "sequence");



CREATE INDEX "combat_actions_created_by_idx" ON "public"."combat_actions" USING "btree" ("created_by");



CREATE INDEX "combat_actions_target_idx" ON "public"."combat_actions" USING "btree" ("target_combatant_id");



CREATE INDEX "combat_ammunition_spends_combat_idx" ON "public"."combat_ammunition_spends" USING "btree" ("combat_id", "projectile_key");



CREATE INDEX "combat_area_effects_combat_idx" ON "public"."combat_area_effects" USING "btree" ("combat_id", "status");



CREATE INDEX "combat_area_events_lookup" ON "public"."combat_area_events" USING "btree" ("combat_id", "round_number");



CREATE UNIQUE INDEX "combat_area_stay_once" ON "public"."combat_area_events" USING "btree" ("area_id", "combatant_id", "round_number") WHERE ("event_type" = 'stay'::"text");



CREATE INDEX "combat_hexes_campaign_idx" ON "public"."combat_hexes" USING "btree" ("campaign_id");



CREATE INDEX "combat_hexes_combat_idx" ON "public"."combat_hexes" USING "btree" ("combat_id", "q", "r");



CREATE INDEX "combat_instances_active_actor_idx" ON "public"."combat_instances" USING "btree" ("active_actor_id");



CREATE INDEX "combat_instances_active_responder_idx" ON "public"."combat_instances" USING "btree" ("active_responder_id");



CREATE INDEX "combat_instances_campaign_status_idx" ON "public"."combat_instances" USING "btree" ("campaign_id", "status", "updated_at" DESC);



CREATE INDEX "combat_instances_event_idx" ON "public"."combat_instances" USING "btree" ("event_id");



CREATE INDEX "combat_instances_map_idx" ON "public"."combat_instances" USING "btree" ("map_id");



CREATE INDEX "combat_instances_started_by_idx" ON "public"."combat_instances" USING "btree" ("started_by");



CREATE INDEX "combat_log_actor_idx" ON "public"."combat_log" USING "btree" ("actor_id");



CREATE INDEX "combat_log_campaign_idx" ON "public"."combat_log" USING "btree" ("campaign_id");



CREATE INDEX "combat_log_combat_idx" ON "public"."combat_log" USING "btree" ("combat_id", "id");



CREATE INDEX "combat_log_target_idx" ON "public"."combat_log" USING "btree" ("target_id");



CREATE INDEX "combatant_effects_combat_idx" ON "public"."combatant_effects" USING "btree" ("combat_id", "status");



CREATE INDEX "combatant_effects_combatant_idx" ON "public"."combatant_effects" USING "btree" ("combatant_id", "status");



CREATE INDEX "combatant_effects_expiry_idx" ON "public"."combatant_effects" USING "btree" ("combat_id", "status", "expires_round", "expires_at");



CREATE INDEX "combatants_campaign_controller_idx" ON "public"."combatants" USING "btree" ("campaign_id", "controller_user_id");



CREATE INDEX "combatants_campaign_idx" ON "public"."combatants" USING "btree" ("campaign_id");



CREATE INDEX "combatants_combat_idx" ON "public"."combatants" USING "btree" ("combat_id", "sort_order", "name_snapshot");



CREATE INDEX "combatants_controller_idx" ON "public"."combatants" USING "btree" ("controller_user_id");



CREATE INDEX "combatants_source_idx" ON "public"."combatants" USING "btree" ("source_type", "source_id");



CREATE UNIQUE INDEX "combatants_summon_action_once_idx" ON "public"."combatants" USING "btree" ("combat_id", "source_instance_key") WHERE ("source_instance_key" ~~ 'summon:%'::"text");



CREATE INDEX "hermes_alea_archive_queue" ON "public"."hermes_alea_jobs" USING "btree" ("archive_state", "next_attempt_at");



CREATE INDEX "hermes_alea_detach" ON "public"."hermes_alea_jobs" USING "btree" ("previous_key", "detached_at");



CREATE INDEX "hermes_job_events_job_idx" ON "public"."hermes_job_events" USING "btree" ("job_id", "created_at");



CREATE INDEX "hermes_jobs_recent_idx" ON "public"."hermes_jobs" USING "btree" ("created_at" DESC);



CREATE INDEX "hermes_web_jobs_queue_idx" ON "public"."hermes_web_jobs" USING "btree" ("state", "created_at") WHERE ("state" = ANY (ARRAY['queued'::"text", 'failed'::"text"]));



CREATE UNIQUE INDEX "hermes_web_jobs_race_pose_source_unique" ON "public"."hermes_web_jobs" USING "btree" ("race_pose_id", "source_path") WHERE ("race_pose_id" IS NOT NULL);



CREATE INDEX "honor_definitions_category_status_idx" ON "public"."honor_definitions" USING "btree" ("category", "status");



CREATE UNIQUE INDEX "honor_event_idempotency" ON "public"."honor_grants" USING "btree" ("honor_id", "character_id", "source_event_id") WHERE ("source_event_id" IS NOT NULL);



CREATE INDEX "honor_grants_character" ON "public"."honor_grants" USING "btree" ("character_id");



CREATE UNIQUE INDEX "honor_one_active_grant" ON "public"."honor_grants" USING "btree" ("honor_id", "character_id") WHERE ("revoked_at" IS NULL);



CREATE INDEX "honor_relief_variants_honor_id_idx" ON "public"."honor_relief_variants" USING "btree" ("honor_id");



CREATE INDEX "idx_campaign_members_user" ON "public"."campaign_members" USING "btree" ("user_id");



CREATE INDEX "idx_characters_campaign" ON "public"."characters" USING "btree" ("campaign_id");



CREATE INDEX "idx_characters_owner" ON "public"."characters" USING "btree" ("owner_id");



CREATE INDEX "race_battle_poses_lookup" ON "public"."race_battle_poses" USING "btree" ("race_id", "gender_variant", "pose_key") WHERE "is_active";



CREATE INDEX "round_background_pool_idx" ON "public"."rule_combat_round_backgrounds" USING "btree" ("created_at") WHERE ("is_active" AND ("archived_at" IS NULL));



CREATE INDEX "rule_combat_fumbles_lookup_idx" ON "public"."rule_combat_fumbles" USING "btree" ("ruleset", "table_key", "roll_min", "roll_max") WHERE ("active" = true);



CREATE INDEX "rule_hit_figure_lookup_idx" ON "public"."rule_hit_figure_images" USING "btree" ("race_id", "gender");



CREATE INDEX "rule_magic_artifact_powers_artifact_idx" ON "public"."rule_magic_artifact_powers" USING "btree" ("artifact_id", "sort_order");



CREATE INDEX "rule_magic_artifact_powers_property_idx" ON "public"."rule_magic_artifact_powers" USING "btree" ("property_id");



CREATE INDEX "rule_magic_artifact_powers_spell_idx" ON "public"."rule_magic_artifact_powers" USING "btree" ("spell_id") WHERE ("spell_id" IS NOT NULL);



CREATE INDEX "rule_magic_artifacts_base_idx" ON "public"."rule_magic_artifacts" USING "btree" ("base_kind", "base_item_id") WHERE ("base_kind" IS NOT NULL);



CREATE INDEX "rule_shields_skill_id_idx" ON "public"."rule_shields" USING "btree" ("skill_id");



CREATE INDEX "rule_skills_name_idx" ON "public"."rule_skills" USING "btree" ("name");



CREATE INDEX "rule_skills_type_idx" ON "public"."rule_skills" USING "btree" ("type");



CREATE UNIQUE INDEX "rule_weapon_materials_one_default" ON "public"."rule_weapon_materials" USING "btree" ("is_default") WHERE ("is_default" = true);



CREATE INDEX "rule_weapons_skill_id_idx" ON "public"."rule_weapons" USING "btree" ("skill_id");



CREATE OR REPLACE TRIGGER "arcane_gallery_capture" AFTER INSERT OR UPDATE OF "material_id", "revision" ON "public"."campaign_material_presentations" FOR EACH ROW EXECUTE FUNCTION "public"."arcane_gallery_capture_presentation"();



CREATE OR REPLACE TRIGGER "bilbo_guard_material_archive_trigger" BEFORE UPDATE OF "archived_at" ON "public"."campaign_materials" FOR EACH ROW EXECUTE FUNCTION "public"."bilbo_guard_material_archive"();



CREATE OR REPLACE TRIGGER "campaign_day_consume_provisions" AFTER UPDATE OF "day_number" ON "public"."campaign_day_state" FOR EACH ROW WHEN (("new"."day_number" > "old"."day_number")) EXECUTE FUNCTION "public"."consume_character_provisions_on_day_change"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_hexes_updated_at" BEFORE UPDATE ON "public"."campaign_event_combat_hexes" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_scene_characters_updated_at" BEFORE UPDATE ON "public"."campaign_combat_scene_characters" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_scene_hexes_updated_at" BEFORE UPDATE ON "public"."campaign_combat_scene_hexes" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_scene_monsters_updated_at" BEFORE UPDATE ON "public"."campaign_combat_scene_monsters" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_scene_npcs_updated_at" BEFORE UPDATE ON "public"."campaign_combat_scene_npcs" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_scenes_updated_at" BEFORE UPDATE ON "public"."campaign_combat_scenes" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combat_spawns_updated_at" BEFORE UPDATE ON "public"."campaign_event_combat_spawns" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_combats_updated_at" BEFORE UPDATE ON "public"."campaign_event_combats" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_event_enemies_updated_at" BEFORE UPDATE ON "public"."campaign_event_enemies" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "campaign_journal_combat_trigger" AFTER INSERT ON "public"."combat_log" FOR EACH ROW EXECUTE FUNCTION "private"."append_combat_to_journal"();



CREATE OR REPLACE TRIGGER "campaign_journal_day_trigger" AFTER INSERT ON "public"."campaign_day_history" FOR EACH ROW EXECUTE FUNCTION "private"."append_day_to_journal"();



CREATE OR REPLACE TRIGGER "campaign_material_links_validate" BEFORE INSERT OR UPDATE OF "campaign_id", "entity_type", "entity_id" ON "public"."campaign_material_links" FOR EACH ROW EXECUTE FUNCTION "public"."validate_campaign_material_link"();



CREATE OR REPLACE TRIGGER "campaign_materials_protect_delete" BEFORE DELETE ON "public"."campaign_materials" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_shared_material_delete"();



CREATE OR REPLACE TRIGGER "campaign_time_reset_on_new_day" BEFORE UPDATE OF "day_number" ON "public"."campaign_day_state" FOR EACH ROW EXECUTE FUNCTION "public"."reset_campaign_time_on_new_day"();



CREATE OR REPLACE TRIGGER "campaigns_init_day_state" AFTER INSERT ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "public"."init_campaign_day_state"();



CREATE OR REPLACE TRIGGER "campaigns_updated_at" BEFORE UPDATE ON "public"."campaigns" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "characters_init_rest_state" AFTER INSERT ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "public"."init_character_rest_state"();



CREATE OR REPLACE TRIGGER "characters_round_art_live_sync" AFTER UPDATE OF "round_background_path" ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."sync_character_round_art_live"();



CREATE OR REPLACE TRIGGER "characters_updated_at" BEFORE UPDATE ON "public"."characters" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "combat_actions_updated_at" BEFORE UPDATE ON "public"."combat_actions" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "combat_hexes_updated_at" BEFORE UPDATE ON "public"."combat_hexes" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "combat_instances_updated_at" BEFORE UPDATE ON "public"."combat_instances" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "combatants_updated_at" BEFORE UPDATE ON "public"."combatants" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "frodo_validate_presentation" BEFORE INSERT OR UPDATE OF "material_id", "campaign_id" ON "public"."campaign_material_presentations" FOR EACH ROW EXECUTE FUNCTION "public"."frodo_validate_presentation"();



CREATE OR REPLACE TRIGGER "galadriel_folder_signal" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_material_shares" FOR EACH ROW EXECUTE FUNCTION "public"."galadriel_signal_material_change"();



CREATE OR REPLACE TRIGGER "galadriel_presentation_signal" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_material_presentations" FOR EACH ROW EXECUTE FUNCTION "public"."galadriel_signal_material_change"();



CREATE OR REPLACE TRIGGER "haj_area_validate" BEFORE INSERT OR UPDATE ON "public"."combat_area_effects" FOR EACH ROW EXECUTE FUNCTION "private"."haj_validate_area"();



CREATE OR REPLACE TRIGGER "haj_combatant_move" AFTER UPDATE OF "q", "r" ON "public"."combatants" FOR EACH ROW WHEN ((("old"."q" IS DISTINCT FROM "new"."q") OR ("old"."r" IS DISTINCT FROM "new"."r"))) EXECUTE FUNCTION "private"."haj_combatant_move"();



CREATE OR REPLACE TRIGGER "hermes_alea_definition_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."honor_definitions" FOR EACH ROW EXECUTE FUNCTION "private"."hermes_alea_guard"();



CREATE OR REPLACE TRIGGER "hermes_alea_definition_link_guard" BEFORE UPDATE ON "public"."honor_definitions" FOR EACH ROW EXECUTE FUNCTION "private"."hermes_alea_link_guard"();



CREATE OR REPLACE TRIGGER "hermes_alea_relief_guard" BEFORE INSERT OR DELETE OR UPDATE ON "public"."honor_relief_variants" FOR EACH ROW EXECUTE FUNCTION "private"."hermes_alea_guard"();



CREATE OR REPLACE TRIGGER "hermes_alea_relief_link_guard" BEFORE UPDATE ON "public"."honor_relief_variants" FOR EACH ROW EXECUTE FUNCTION "private"."hermes_alea_link_guard"();



CREATE OR REPLACE TRIGGER "map_sync_active_map" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_map_settings" FOR EACH ROW EXECUTE FUNCTION "private"."bump_campaign_map_signal"();



CREATE OR REPLACE TRIGGER "map_sync_location_status" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_location_state" FOR EACH ROW EXECUTE FUNCTION "private"."bump_campaign_map_signal"();



CREATE OR REPLACE TRIGGER "map_sync_map_areas" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_map_areas" FOR EACH ROW EXECUTE FUNCTION "private"."bump_campaign_map_signal"();



CREATE OR REPLACE TRIGGER "map_sync_maps" AFTER INSERT OR DELETE OR UPDATE ON "public"."campaign_maps" FOR EACH ROW EXECUTE FUNCTION "private"."bump_campaign_map_signal"();



CREATE OR REPLACE TRIGGER "profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "private"."set_updated_at"();



CREATE OR REPLACE TRIGGER "protect_magic_property_kind_before_update" BEFORE UPDATE ON "public"."rule_magic_property_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."protect_magic_property_kind"();



CREATE OR REPLACE TRIGGER "rule_races_seed_attribute_rows" AFTER INSERT ON "public"."rule_races" FOR EACH ROW EXECUTE FUNCTION "public"."seed_rule_race_attribute_rows"();



CREATE OR REPLACE TRIGGER "sam_guard_material_share" BEFORE INSERT OR UPDATE OF "campaign_id", "material_id", "revoked_at" ON "public"."campaign_material_shares" FOR EACH ROW EXECUTE FUNCTION "public"."sam_guard_material_share"();



CREATE OR REPLACE TRIGGER "trg_alea_create_location_state" AFTER INSERT ON "public"."campaign_locations" FOR EACH ROW EXECUTE FUNCTION "public"."alea_create_location_state"();



CREATE OR REPLACE TRIGGER "trg_campaign_location_assets_updated" BEFORE UPDATE ON "public"."campaign_location_assets" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_location_events_updated" BEFORE UPDATE ON "public"."campaign_location_events" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_location_gm_notes_updated" BEFORE UPDATE ON "public"."campaign_location_gm_notes" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_location_player_texts_updated" BEFORE UPDATE ON "public"."campaign_location_player_texts" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_location_state_updated" BEFORE UPDATE ON "public"."campaign_location_state" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_locations_updated" BEFORE UPDATE ON "public"."campaign_locations" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_map_areas_updated" BEFORE UPDATE ON "public"."campaign_map_areas" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_map_settings_updated" BEFORE UPDATE ON "public"."campaign_map_settings" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_maps_updated" BEFORE UPDATE ON "public"."campaign_maps" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_campaign_sites_updated" BEFORE UPDATE ON "public"."campaign_sites" FOR EACH ROW EXECUTE FUNCTION "public"."alea_set_updated_at"();



CREATE OR REPLACE TRIGGER "validate_campaign_image_link_trigger" BEFORE INSERT OR UPDATE ON "public"."campaign_image_links" FOR EACH ROW EXECUTE FUNCTION "public"."validate_campaign_image_link"();



CREATE OR REPLACE TRIGGER "validate_magic_artifact_power_before_write" BEFORE INSERT OR UPDATE ON "public"."rule_magic_artifact_powers" FOR EACH ROW EXECUTE FUNCTION "public"."validate_magic_artifact_power"();



ALTER TABLE ONLY "public"."campaign_audio_events"
    ADD CONSTRAINT "campaign_audio_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_audio_events"
    ADD CONSTRAINT "campaign_audio_events_cue_key_fkey" FOREIGN KEY ("cue_key") REFERENCES "public"."rule_sound_cues"("cue_key") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaign_audio_state"
    ADD CONSTRAINT "campaign_audio_state_ambience_cue_key_fkey" FOREIGN KEY ("ambience_cue_key") REFERENCES "public"."rule_sound_cues"("cue_key") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_audio_state"
    ADD CONSTRAINT "campaign_audio_state_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_audio_state"
    ADD CONSTRAINT "campaign_audio_state_source_location_id_fkey" FOREIGN KEY ("source_location_id") REFERENCES "public"."campaign_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_combat_scene_combatants"
    ADD CONSTRAINT "campaign_combat_scene_combatants_scene_fkey" FOREIGN KEY ("scene_id", "campaign_id") REFERENCES "public"."campaign_combat_scenes"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scenes"
    ADD CONSTRAINT "campaign_combat_scenes_source_event_fkey" FOREIGN KEY ("source_event_id") REFERENCES "public"."campaign_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_day_history"
    ADD CONSTRAINT "campaign_day_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_day_history"
    ADD CONSTRAINT "campaign_day_history_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_day_state"
    ADD CONSTRAINT "campaign_day_state_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_day_state"
    ADD CONSTRAINT "campaign_day_state_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_event_combat_hexes"
    ADD CONSTRAINT "campaign_event_combat_hexes_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."campaign_event_combats"("event_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_characters"
    ADD CONSTRAINT "campaign_event_combat_scene_characters_character_fkey" FOREIGN KEY ("character_id", "campaign_id") REFERENCES "public"."characters"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_characters"
    ADD CONSTRAINT "campaign_event_combat_scene_characters_scene_fkey" FOREIGN KEY ("scene_id", "campaign_id") REFERENCES "public"."campaign_combat_scenes"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_hexes"
    ADD CONSTRAINT "campaign_event_combat_scene_hexes_scene_id_fkey" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_combat_scenes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_monsters"
    ADD CONSTRAINT "campaign_event_combat_scene_monsters_monster_fkey" FOREIGN KEY ("monster_id", "campaign_id") REFERENCES "public"."campaign_monsters"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_monsters"
    ADD CONSTRAINT "campaign_event_combat_scene_monsters_scene_fkey" FOREIGN KEY ("scene_id", "campaign_id") REFERENCES "public"."campaign_combat_scenes"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_npcs"
    ADD CONSTRAINT "campaign_event_combat_scene_npcs_npc_fkey" FOREIGN KEY ("npc_id", "campaign_id") REFERENCES "public"."campaign_npcs"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scene_npcs"
    ADD CONSTRAINT "campaign_event_combat_scene_npcs_scene_fkey" FOREIGN KEY ("scene_id", "campaign_id") REFERENCES "public"."campaign_combat_scenes"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scenes"
    ADD CONSTRAINT "campaign_event_combat_scenes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_combat_scenes"
    ADD CONSTRAINT "campaign_event_combat_scenes_location_campaign_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE SET NULL ("location_id");



ALTER TABLE ONLY "public"."campaign_combat_scenes"
    ADD CONSTRAINT "campaign_event_combat_scenes_map_campaign_fkey" FOREIGN KEY ("map_id", "campaign_id") REFERENCES "public"."campaign_maps"("id", "campaign_id") ON DELETE SET NULL ("map_id");



ALTER TABLE ONLY "public"."campaign_event_combat_spawns"
    ADD CONSTRAINT "campaign_event_combat_spawns_controller_user_id_fkey" FOREIGN KEY ("controller_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_event_combat_spawns"
    ADD CONSTRAINT "campaign_event_combat_spawns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."campaign_event_combats"("event_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_combats"
    ADD CONSTRAINT "campaign_event_combats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_combats"
    ADD CONSTRAINT "campaign_event_combats_event_campaign_fkey" FOREIGN KEY ("event_id", "campaign_id") REFERENCES "public"."campaign_events"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_combats"
    ADD CONSTRAINT "campaign_event_combats_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."campaign_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_combats"
    ADD CONSTRAINT "campaign_event_combats_map_campaign_fkey" FOREIGN KEY ("map_id", "campaign_id") REFERENCES "public"."campaign_maps"("id", "campaign_id") ON DELETE SET NULL ("map_id");



ALTER TABLE ONLY "public"."campaign_event_combats"
    ADD CONSTRAINT "campaign_event_combats_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_event_campaign_fkey" FOREIGN KEY ("event_id", "campaign_id") REFERENCES "public"."campaign_events"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."campaign_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_monster_campaign_fkey" FOREIGN KEY ("monster_id", "campaign_id") REFERENCES "public"."campaign_monsters"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_event_enemies"
    ADD CONSTRAINT "campaign_event_enemies_monster_id_fkey" FOREIGN KEY ("monster_id") REFERENCES "public"."campaign_monsters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_events"
    ADD CONSTRAINT "campaign_events_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_image_links"
    ADD CONSTRAINT "campaign_image_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_image_links"
    ADD CONSTRAINT "campaign_image_links_image_id_campaign_id_fkey" FOREIGN KEY ("image_id", "campaign_id") REFERENCES "public"."campaign_images"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_images"
    ADD CONSTRAINT "campaign_images_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_journal_entries"
    ADD CONSTRAINT "campaign_journal_entries_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_assets"
    ADD CONSTRAINT "campaign_location_assets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_location_assets"
    ADD CONSTRAINT "campaign_location_assets_location_id_campaign_id_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_event_links"
    ADD CONSTRAINT "campaign_location_event_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_event_links"
    ADD CONSTRAINT "campaign_location_event_links_event_campaign_fkey" FOREIGN KEY ("event_id", "campaign_id") REFERENCES "public"."campaign_events"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_event_links"
    ADD CONSTRAINT "campaign_location_event_links_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."campaign_events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_event_links"
    ADD CONSTRAINT "campaign_location_event_links_location_campaign_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_event_links"
    ADD CONSTRAINT "campaign_location_event_links_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."campaign_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_events"
    ADD CONSTRAINT "campaign_location_events_location_id_campaign_id_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_gm_notes"
    ADD CONSTRAINT "campaign_location_gm_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_location_gm_notes"
    ADD CONSTRAINT "campaign_location_gm_notes_location_id_campaign_id_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_monster_links"
    ADD CONSTRAINT "campaign_location_monster_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_monster_links"
    ADD CONSTRAINT "campaign_location_monster_links_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."campaign_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_monster_links"
    ADD CONSTRAINT "campaign_location_monster_links_monster_id_fkey" FOREIGN KEY ("monster_id") REFERENCES "public"."campaign_monsters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_npc_links"
    ADD CONSTRAINT "campaign_location_npc_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_npc_links"
    ADD CONSTRAINT "campaign_location_npc_links_location_id_fkey" FOREIGN KEY ("location_id") REFERENCES "public"."campaign_locations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_npc_links"
    ADD CONSTRAINT "campaign_location_npc_links_npc_id_fkey" FOREIGN KEY ("npc_id") REFERENCES "public"."campaign_npcs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_player_texts"
    ADD CONSTRAINT "campaign_location_player_texts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_location_player_texts"
    ADD CONSTRAINT "campaign_location_player_texts_location_id_campaign_id_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_state"
    ADD CONSTRAINT "campaign_location_state_location_id_campaign_id_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_location_state"
    ADD CONSTRAINT "campaign_location_state_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_locations"
    ADD CONSTRAINT "campaign_locations_ambience_cue_key_fkey" FOREIGN KEY ("ambience_cue_key") REFERENCES "public"."rule_sound_cues"("cue_key") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_locations"
    ADD CONSTRAINT "campaign_locations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_locations"
    ADD CONSTRAINT "campaign_locations_site_id_campaign_id_fkey" FOREIGN KEY ("site_id", "campaign_id") REFERENCES "public"."campaign_sites"("id", "campaign_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaign_map_areas"
    ADD CONSTRAINT "campaign_map_areas_location_id_campaign_id_fkey" FOREIGN KEY ("location_id", "campaign_id") REFERENCES "public"."campaign_locations"("id", "campaign_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaign_map_areas"
    ADD CONSTRAINT "campaign_map_areas_map_id_campaign_id_fkey" FOREIGN KEY ("map_id", "campaign_id") REFERENCES "public"."campaign_maps"("id", "campaign_id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_map_settings"
    ADD CONSTRAINT "campaign_map_settings_active_map_id_campaign_id_fkey" FOREIGN KEY ("active_map_id", "campaign_id") REFERENCES "public"."campaign_maps"("id", "campaign_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaign_map_settings"
    ADD CONSTRAINT "campaign_map_settings_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_map_settings"
    ADD CONSTRAINT "campaign_map_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_map_signals"
    ADD CONSTRAINT "campaign_map_signals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_maps"
    ADD CONSTRAINT "campaign_maps_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_maps"
    ADD CONSTRAINT "campaign_maps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_maps"
    ADD CONSTRAINT "campaign_maps_site_id_campaign_id_fkey" FOREIGN KEY ("site_id", "campaign_id") REFERENCES "public"."campaign_sites"("id", "campaign_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaign_material_gm_notes"
    ADD CONSTRAINT "campaign_material_gm_notes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_links"
    ADD CONSTRAINT "campaign_material_links_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_links"
    ADD CONSTRAINT "campaign_material_links_material_fk" FOREIGN KEY ("campaign_id", "material_id") REFERENCES "public"."campaign_materials"("campaign_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_gm_notes"
    ADD CONSTRAINT "campaign_material_notes_material_fk" FOREIGN KEY ("campaign_id", "material_id") REFERENCES "public"."campaign_materials"("campaign_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_presentation_history"
    ADD CONSTRAINT "campaign_material_presentation_his_campaign_id_material_id_fkey" FOREIGN KEY ("campaign_id", "material_id") REFERENCES "public"."campaign_materials"("campaign_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_presentation_history"
    ADD CONSTRAINT "campaign_material_presentation_history_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_presentations"
    ADD CONSTRAINT "campaign_material_presentation_material_fk" FOREIGN KEY ("campaign_id", "material_id") REFERENCES "public"."campaign_materials"("campaign_id", "id");



ALTER TABLE ONLY "public"."campaign_material_presentations"
    ADD CONSTRAINT "campaign_material_presentations_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_presentations"
    ADD CONSTRAINT "campaign_material_presentations_shown_by_fkey" FOREIGN KEY ("shown_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_material_shares"
    ADD CONSTRAINT "campaign_material_shares_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_shares"
    ADD CONSTRAINT "campaign_material_shares_material_fk" FOREIGN KEY ("campaign_id", "material_id") REFERENCES "public"."campaign_materials"("campaign_id", "id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_material_shares"
    ADD CONSTRAINT "campaign_material_shares_shared_by_fkey" FOREIGN KEY ("shared_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_material_signals"
    ADD CONSTRAINT "campaign_material_signals_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_materials"
    ADD CONSTRAINT "campaign_materials_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_materials"
    ADD CONSTRAINT "campaign_materials_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_members"
    ADD CONSTRAINT "campaign_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_monsters"
    ADD CONSTRAINT "campaign_monsters_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_monsters"
    ADD CONSTRAINT "campaign_monsters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_monsters"
    ADD CONSTRAINT "campaign_monsters_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "public"."campaign_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_npcs"
    ADD CONSTRAINT "campaign_npcs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_npcs"
    ADD CONSTRAINT "campaign_npcs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."campaign_npcs"
    ADD CONSTRAINT "campaign_npcs_current_location_id_fkey" FOREIGN KEY ("current_location_id") REFERENCES "public"."campaign_locations"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_npcs"
    ADD CONSTRAINT "campaign_npcs_source_global_npc_id_fkey" FOREIGN KEY ("source_global_npc_id") REFERENCES "public"."global_npcs"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_sites"
    ADD CONSTRAINT "campaign_sites_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."campaign_sites"
    ADD CONSTRAINT "campaign_sites_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."campaign_sites"
    ADD CONSTRAINT "campaign_sites_parent_site_id_campaign_id_fkey" FOREIGN KEY ("parent_site_id", "campaign_id") REFERENCES "public"."campaign_sites"("id", "campaign_id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."campaigns"
    ADD CONSTRAINT "campaigns_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."character_erf_awards"
    ADD CONSTRAINT "character_erf_awards_awarded_by_fkey" FOREIGN KEY ("awarded_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."character_erf_awards"
    ADD CONSTRAINT "character_erf_awards_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_erf_awards"
    ADD CONSTRAINT "character_erf_awards_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_rest_state"
    ADD CONSTRAINT "character_rest_state_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."character_rest_state"
    ADD CONSTRAINT "character_rest_state_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."characters"
    ADD CONSTRAINT "characters_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_actions"
    ADD CONSTRAINT "combat_actions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_actions"
    ADD CONSTRAINT "combat_actions_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_actions"
    ADD CONSTRAINT "combat_actions_combatant_id_fkey" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_actions"
    ADD CONSTRAINT "combat_actions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_actions"
    ADD CONSTRAINT "combat_actions_target_combatant_id_fkey" FOREIGN KEY ("target_combatant_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_ammunition_spends"
    ADD CONSTRAINT "combat_ammunition_spends_action_id_fkey" FOREIGN KEY ("action_id") REFERENCES "public"."combat_actions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_ammunition_spends"
    ADD CONSTRAINT "combat_ammunition_spends_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_ammunition_spends"
    ADD CONSTRAINT "combat_ammunition_spends_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_ammunition_spends"
    ADD CONSTRAINT "combat_ammunition_spends_combatant_id_fkey" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_ammunition_spends"
    ADD CONSTRAINT "combat_ammunition_spends_projectile_key_fkey" FOREIGN KEY ("projectile_key") REFERENCES "public"."rule_projectile_types"("projectile_key");



ALTER TABLE ONLY "public"."combat_area_effects"
    ADD CONSTRAINT "combat_area_effects_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_area_effects"
    ADD CONSTRAINT "combat_area_effects_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_area_effects"
    ADD CONSTRAINT "combat_area_effects_effect_id_fkey" FOREIGN KEY ("effect_id") REFERENCES "public"."rule_effects"("id");



ALTER TABLE ONLY "public"."combat_area_effects"
    ADD CONSTRAINT "combat_area_effects_source_combatant_id_fkey" FOREIGN KEY ("source_combatant_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_area_events"
    ADD CONSTRAINT "combat_area_events_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "public"."combat_area_effects"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_area_events"
    ADD CONSTRAINT "combat_area_events_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_area_events"
    ADD CONSTRAINT "combat_area_events_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_area_events"
    ADD CONSTRAINT "combat_area_events_combatant_id_fkey" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_hexes"
    ADD CONSTRAINT "combat_hexes_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_hexes"
    ADD CONSTRAINT "combat_hexes_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_active_actor_fkey" FOREIGN KEY ("active_actor_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_active_responder_fkey" FOREIGN KEY ("active_responder_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."campaign_events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_map_id_fkey" FOREIGN KEY ("map_id") REFERENCES "public"."campaign_maps"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_instances"
    ADD CONSTRAINT "combat_instances_started_by_fkey" FOREIGN KEY ("started_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_log"
    ADD CONSTRAINT "combat_log_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combat_log"
    ADD CONSTRAINT "combat_log_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_log"
    ADD CONSTRAINT "combat_log_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combat_log"
    ADD CONSTRAINT "combat_log_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combatant_effects"
    ADD CONSTRAINT "combatant_effects_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combatant_effects"
    ADD CONSTRAINT "combatant_effects_combatant_id_fkey" FOREIGN KEY ("combatant_id") REFERENCES "public"."combatants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combatant_effects"
    ADD CONSTRAINT "combatant_effects_effect_id_fkey" FOREIGN KEY ("effect_id") REFERENCES "public"."rule_effects"("id");



ALTER TABLE ONLY "public"."combatant_effects"
    ADD CONSTRAINT "combatant_effects_source_action_id_fkey" FOREIGN KEY ("source_action_id") REFERENCES "public"."combat_actions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combatant_effects"
    ADD CONSTRAINT "combatant_effects_source_combatant_id_fkey" FOREIGN KEY ("source_combatant_id") REFERENCES "public"."combatants"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."combatants"
    ADD CONSTRAINT "combatants_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combatants"
    ADD CONSTRAINT "combatants_combat_id_fkey" FOREIGN KEY ("combat_id") REFERENCES "public"."combat_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."combatants"
    ADD CONSTRAINT "combatants_controller_user_id_fkey" FOREIGN KEY ("controller_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."hermes_alea_jobs"
    ADD CONSTRAINT "hermes_alea_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hermes_job_events"
    ADD CONSTRAINT "hermes_job_events_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."hermes_jobs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."hermes_jobs"
    ADD CONSTRAINT "hermes_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."hermes_web_jobs"
    ADD CONSTRAINT "hermes_web_jobs_pose_id_fkey" FOREIGN KEY ("pose_id") REFERENCES "public"."combatant_battle_poses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."hermes_web_jobs"
    ADD CONSTRAINT "hermes_web_jobs_race_pose_id_fkey" FOREIGN KEY ("race_pose_id") REFERENCES "public"."race_battle_poses"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."honor_definitions"
    ADD CONSTRAINT "honor_definitions_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."honor_definitions"
    ADD CONSTRAINT "honor_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."honor_definitions"
    ADD CONSTRAINT "honor_definitions_preview_variant_fkey" FOREIGN KEY ("preview_variant_id") REFERENCES "public"."honor_relief_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."honor_definitions"
    ADD CONSTRAINT "honor_definitions_published_variant_fkey" FOREIGN KEY ("published_variant_id") REFERENCES "public"."honor_relief_variants"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."honor_grants"
    ADD CONSTRAINT "honor_grants_character_id_fkey" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."honor_grants"
    ADD CONSTRAINT "honor_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."honor_grants"
    ADD CONSTRAINT "honor_grants_honor_id_fkey" FOREIGN KEY ("honor_id") REFERENCES "public"."honor_definitions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."honor_grants"
    ADD CONSTRAINT "honor_grants_revoked_by_fkey" FOREIGN KEY ("revoked_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."honor_relief_variants"
    ADD CONSTRAINT "honor_relief_variants_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."honor_relief_variants"
    ADD CONSTRAINT "honor_relief_variants_honor_id_fkey" FOREIGN KEY ("honor_id") REFERENCES "public"."honor_definitions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."race_battle_poses"
    ADD CONSTRAINT "race_battle_poses_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."rule_races"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rule_hit_figure_images"
    ADD CONSTRAINT "rule_hit_figure_images_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."rule_races"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rule_magic_artifact_powers"
    ADD CONSTRAINT "rule_magic_artifact_powers_artifact_id_fkey" FOREIGN KEY ("artifact_id") REFERENCES "public"."rule_magic_artifacts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rule_magic_artifact_powers"
    ADD CONSTRAINT "rule_magic_artifact_powers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "public"."rule_magic_property_definitions"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rule_magic_artifact_powers"
    ADD CONSTRAINT "rule_magic_artifact_powers_spell_id_fkey" FOREIGN KEY ("spell_id") REFERENCES "public"."rule_spells"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rule_race_attributes"
    ADD CONSTRAINT "rule_race_attributes_race_id_fkey" FOREIGN KEY ("race_id") REFERENCES "public"."rule_races"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."rule_shields"
    ADD CONSTRAINT "rule_shields_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."rule_skills"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rule_spells"
    ADD CONSTRAINT "rule_spells_impact_animation_key_fkey" FOREIGN KEY ("impact_animation_key") REFERENCES "public"."combat_animation_cues"("event_key") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rule_spells"
    ADD CONSTRAINT "rule_spells_projectile_animation_key_fkey" FOREIGN KEY ("projectile_animation_key") REFERENCES "public"."combat_animation_cues"("event_key") ON UPDATE CASCADE ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rule_spells"
    ADD CONSTRAINT "rule_spells_school_id_fkey" FOREIGN KEY ("school_id") REFERENCES "public"."rule_magic_schools"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."rule_weapons"
    ADD CONSTRAINT "rule_weapons_projectile_key_fkey" FOREIGN KEY ("projectile_key") REFERENCES "public"."rule_projectile_types"("projectile_key");



ALTER TABLE ONLY "public"."rule_weapons"
    ADD CONSTRAINT "rule_weapons_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "public"."rule_skills"("id") ON UPDATE CASCADE ON DELETE RESTRICT;



ALTER TABLE "private"."hermes_alea_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hermes_alea_settings_service_read" ON "private"."hermes_alea_settings" FOR SELECT TO "service_role" USING (true);



CREATE POLICY "arcane_gallery_history_gm_insert" ON "public"."campaign_material_presentation_history" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



CREATE POLICY "arcane_gallery_history_material_read" ON "public"."campaign_materials" FOR SELECT TO "authenticated" USING ((("archived_at" IS NULL) AND ("asset_kind" = 'image'::"text") AND "private"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_material_presentation_history" "h"
  WHERE (("h"."campaign_id" = "campaign_materials"."campaign_id") AND ("h"."material_id" = "campaign_materials"."id"))))));



CREATE POLICY "arcane_gallery_history_member_read" ON "public"."campaign_material_presentation_history" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



ALTER TABLE "public"."arcane_system_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "arcane_system_assets_published_read" ON "public"."arcane_system_assets" FOR SELECT TO "authenticated" USING (("asset_path" IS NOT NULL));



ALTER TABLE "public"."campaign_audio_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_audio_events_gm_insert" ON "public"."campaign_audio_events" FOR INSERT TO "authenticated" WITH CHECK ((("private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()) AND ("created_by" = ( SELECT "auth"."uid"() AS "uid"))));



CREATE POLICY "campaign_audio_events_member_read" ON "public"."campaign_audio_events" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



ALTER TABLE "public"."campaign_audio_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_audio_state_gm_insert" ON "public"."campaign_audio_state" FOR INSERT TO "authenticated" WITH CHECK (("private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



CREATE POLICY "campaign_audio_state_gm_update" ON "public"."campaign_audio_state" FOR UPDATE TO "authenticated" USING (("private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"())) WITH CHECK (("private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



CREATE POLICY "campaign_audio_state_member_read" ON "public"."campaign_audio_state" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



ALTER TABLE "public"."campaign_combat_scene_characters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_combat_scene_combatants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_combat_scene_combatants_manage" ON "public"."campaign_combat_scene_combatants" TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_combatants"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_combatants"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."campaign_combat_scene_hexes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_combat_scene_monsters" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_combat_scene_npcs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_combat_scenes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_day_history" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_day_history_select" ON "public"."campaign_day_history" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_campaign_member"("campaign_day_history"."campaign_id") AS "is_campaign_member"));



ALTER TABLE "public"."campaign_day_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_day_state_select" ON "public"."campaign_day_state" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_campaign_member"("campaign_day_state"."campaign_id") AS "is_campaign_member"));



ALTER TABLE "public"."campaign_event_combat_hexes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_event_combat_hexes_delete" ON "public"."campaign_event_combat_hexes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_hexes"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_hexes_insert" ON "public"."campaign_event_combat_hexes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_hexes"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_hexes_select" ON "public"."campaign_event_combat_hexes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_hexes"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_hexes_update" ON "public"."campaign_event_combat_hexes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_hexes"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_hexes"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_scene_characters_manage" ON "public"."campaign_combat_scene_characters" TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_characters"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_characters"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combat_scene_hexes_delete" ON "public"."campaign_combat_scene_hexes" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_combat_scenes" "s"
  WHERE (("s"."id" = "campaign_combat_scene_hexes"."scene_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("s"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_scene_hexes_insert" ON "public"."campaign_combat_scene_hexes" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaign_combat_scenes" "s"
  WHERE (("s"."id" = "campaign_combat_scene_hexes"."scene_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("s"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_scene_hexes_select" ON "public"."campaign_combat_scene_hexes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_combat_scenes" "s"
  WHERE (("s"."id" = "campaign_combat_scene_hexes"."scene_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("s"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_scene_hexes_update" ON "public"."campaign_combat_scene_hexes" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_combat_scenes" "s"
  WHERE (("s"."id" = "campaign_combat_scene_hexes"."scene_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("s"."campaign_id") AS "is_campaign_gm")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaign_combat_scenes" "s"
  WHERE (("s"."id" = "campaign_combat_scene_hexes"."scene_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("s"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_scene_monsters_manage" ON "public"."campaign_combat_scene_monsters" TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_monsters"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_monsters"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combat_scene_npcs_manage" ON "public"."campaign_combat_scene_npcs" TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_npcs"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scene_npcs"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combat_scenes_delete" ON "public"."campaign_combat_scenes" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scenes"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combat_scenes_insert" ON "public"."campaign_combat_scenes" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scenes"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combat_scenes_select" ON "public"."campaign_combat_scenes" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scenes"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combat_scenes_update" ON "public"."campaign_combat_scenes" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scenes"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_combat_scenes"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."campaign_event_combat_spawns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_event_combat_spawns_delete" ON "public"."campaign_event_combat_spawns" FOR DELETE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_spawns"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_spawns_insert" ON "public"."campaign_event_combat_spawns" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_spawns"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_spawns_select" ON "public"."campaign_event_combat_spawns" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_spawns"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



CREATE POLICY "campaign_event_combat_spawns_update" ON "public"."campaign_event_combat_spawns" FOR UPDATE TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_spawns"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."campaign_event_combats" "c"
  WHERE (("c"."event_id" = "campaign_event_combat_spawns"."event_id") AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("c"."campaign_id") AS "is_campaign_gm"))))));



ALTER TABLE "public"."campaign_event_combats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_event_combats_delete" ON "public"."campaign_event_combats" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_combats"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combats_insert" ON "public"."campaign_event_combats" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_combats"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combats_select" ON "public"."campaign_event_combats" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_combats"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_combats_update" ON "public"."campaign_event_combats" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_combats"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_combats"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."campaign_event_enemies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_event_enemies_select" ON "public"."campaign_event_enemies" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_enemies"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "campaign_event_enemies_write" ON "public"."campaign_event_enemies" TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_enemies"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_event_enemies"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."campaign_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_events_select" ON "public"."campaign_events" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("player_visible" AND "private"."is_campaign_member"("campaign_id"))));



CREATE POLICY "campaign_events_write" ON "public"."campaign_events" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_image_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_image_links_gm_all" ON "public"."campaign_image_links" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_image_links_player_read" ON "public"."campaign_image_links" FOR SELECT TO "authenticated" USING (("player_visible" AND "private"."is_campaign_member"("campaign_id")));



ALTER TABLE "public"."campaign_images" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_images_gm_all" ON "public"."campaign_images" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_images_player_read" ON "public"."campaign_images" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_image_links" "l"
  WHERE (("l"."image_id" = "l"."id") AND "l"."player_visible")))));



ALTER TABLE "public"."campaign_journal_entries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_location_assets" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_assets_manage" ON "public"."campaign_location_assets" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_location_assets_select" ON "public"."campaign_location_assets" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("player_visible" AND "private"."is_campaign_member"("campaign_id"))));



CREATE POLICY "campaign_location_assets_write" ON "public"."campaign_location_assets" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_event_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_event_links_select" ON "public"."campaign_location_event_links" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_campaign_member"("campaign_id")));



CREATE POLICY "campaign_location_event_links_write" ON "public"."campaign_location_event_links" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_events_manage" ON "public"."campaign_location_events" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_gm_notes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_gm_notes_manage" ON "public"."campaign_location_gm_notes" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_location_gm_notes_select" ON "public"."campaign_location_gm_notes" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_location_gm_notes_write" ON "public"."campaign_location_gm_notes" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_monster_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_monster_links_select" ON "public"."campaign_location_monster_links" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_campaign_member"("campaign_id")));



CREATE POLICY "campaign_location_monster_links_write" ON "public"."campaign_location_monster_links" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_npc_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_npc_links_select" ON "public"."campaign_location_npc_links" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_campaign_member"("campaign_id")));



CREATE POLICY "campaign_location_npc_links_write" ON "public"."campaign_location_npc_links" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_player_texts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_player_texts_manage" ON "public"."campaign_location_player_texts" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_location_player_texts_select" ON "public"."campaign_location_player_texts" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("player_visible" AND "private"."is_campaign_member"("campaign_id"))));



CREATE POLICY "campaign_location_player_texts_write" ON "public"."campaign_location_player_texts" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_location_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_location_state_manage" ON "public"."campaign_location_state" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_location_state_select" ON "public"."campaign_location_state" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR (("status" <> 'unknown'::"text") AND "private"."is_campaign_member"("campaign_id"))));



ALTER TABLE "public"."campaign_locations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_locations_manage" ON "public"."campaign_locations" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_locations_select" ON "public"."campaign_locations" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("private"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_location_state" "s"
  WHERE (("s"."location_id" = "campaign_locations"."id") AND ("s"."status" <> 'unknown'::"text")))) AND (EXISTS ( SELECT 1
   FROM ("public"."campaign_map_areas" "a"
     JOIN "public"."campaign_maps" "m" ON (("m"."id" = "a"."map_id")))
  WHERE (("a"."location_id" = "campaign_locations"."id") AND ("m"."player_visible" = true)))))));



ALTER TABLE "public"."campaign_map_areas" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_map_areas_manage" ON "public"."campaign_map_areas" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_map_areas_select" ON "public"."campaign_map_areas" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."campaign_maps" "m"
  WHERE (("m"."id" = "campaign_map_areas"."map_id") AND ("private"."is_campaign_gm"("m"."campaign_id") OR (("m"."player_visible" = true) AND "private"."is_campaign_member"("m"."campaign_id"))))))));



ALTER TABLE "public"."campaign_map_settings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_map_settings_manage" ON "public"."campaign_map_settings" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_map_settings_select" ON "public"."campaign_map_settings" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("private"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_maps" "m"
  WHERE (("m"."id" = "campaign_map_settings"."active_map_id") AND ("m"."player_visible" = true)))))));



ALTER TABLE "public"."campaign_map_signals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_map_signals_member_read" ON "public"."campaign_map_signals" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



ALTER TABLE "public"."campaign_maps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_maps_active_combat_select" ON "public"."campaign_maps" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") AND (EXISTS ( SELECT 1
   FROM "public"."combat_instances" "ci"
  WHERE (("ci"."campaign_id" = "campaign_maps"."campaign_id") AND ("ci"."map_id" = "campaign_maps"."id") AND ("ci"."status" = ANY (ARRAY['active'::"text", 'paused'::"text"])))))));



CREATE POLICY "campaign_maps_manage" ON "public"."campaign_maps" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_maps_select" ON "public"."campaign_maps" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR (("player_visible" = true) AND "private"."is_campaign_member"("campaign_id"))));



ALTER TABLE "public"."campaign_material_gm_notes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_material_links" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_material_links_gm_only" ON "public"."campaign_material_links" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_material_notes_gm_only" ON "public"."campaign_material_gm_notes" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_material_presentation_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_material_presentations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_material_presentations_gm_write" ON "public"."campaign_material_presentations" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_material_presentations_player_read" ON "public"."campaign_material_presentations" FOR SELECT TO "authenticated" USING ("private"."is_campaign_member"("campaign_id"));



ALTER TABLE "public"."campaign_material_shares" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_material_shares_gm_write" ON "public"."campaign_material_shares" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_material_shares_player_read" ON "public"."campaign_material_shares" FOR SELECT TO "authenticated" USING ((("revoked_at" IS NULL) AND "private"."is_campaign_member"("campaign_id")));



ALTER TABLE "public"."campaign_material_signals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_material_signals_member_read" ON "public"."campaign_material_signals" FOR SELECT TO "authenticated" USING (("private"."is_campaign_member"("campaign_id") OR "private"."is_campaign_gm"("campaign_id") OR "private"."is_admin"()));



ALTER TABLE "public"."campaign_materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_materials_gm_write" ON "public"."campaign_materials" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_materials_player_read" ON "public"."campaign_materials" FOR SELECT TO "authenticated" USING ((("archived_at" IS NULL) AND "private"."is_campaign_member"("campaign_id") AND ((EXISTS ( SELECT 1
   FROM "public"."campaign_material_shares" "s"
  WHERE (("s"."campaign_id" = "campaign_materials"."campaign_id") AND ("s"."material_id" = "campaign_materials"."id") AND ("s"."revoked_at" IS NULL)))) OR (EXISTS ( SELECT 1
   FROM "public"."campaign_material_presentations" "p"
  WHERE (("p"."campaign_id" = "campaign_materials"."campaign_id") AND ("p"."material_id" = "campaign_materials"."id")))))));



ALTER TABLE "public"."campaign_members" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."campaign_monsters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_monsters_select" ON "public"."campaign_monsters" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("player_visible" AND "private"."is_campaign_member"("campaign_id"))));



CREATE POLICY "campaign_monsters_write" ON "public"."campaign_monsters" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_npcs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_npcs_select" ON "public"."campaign_npcs" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR ("player_visible" AND "private"."is_campaign_member"("campaign_id"))));



CREATE POLICY "campaign_npcs_write" ON "public"."campaign_npcs" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."campaign_sites" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaign_sites_manage" ON "public"."campaign_sites" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



CREATE POLICY "campaign_sites_select" ON "public"."campaign_sites" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id") OR (EXISTS ( SELECT 1
   FROM "public"."campaign_maps" "m"
  WHERE (("m"."campaign_id" = "campaign_sites"."campaign_id") AND ("m"."site_id" = "campaign_sites"."id") AND ("m"."player_visible" = true) AND "private"."is_campaign_member"("m"."campaign_id"))))));



ALTER TABLE "public"."campaigns" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "campaigns_delete" ON "public"."campaigns" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "campaigns_insert" ON "public"."campaigns" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "campaigns_select" ON "public"."campaigns" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_member"("campaigns"."id") AS "is_campaign_member")));



CREATE POLICY "campaigns_update" ON "public"."campaigns" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaigns"."id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaigns"."id") AS "is_campaign_gm")));



ALTER TABLE "public"."character_erf_awards" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_erf_awards_select" ON "public"."character_erf_awards" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("character_erf_awards"."campaign_id") AS "is_campaign_gm") OR (EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_erf_awards"."character_id") AND ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."character_rest_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "character_rest_state_select" ON "public"."character_rest_state" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("character_rest_state"."campaign_id") AS "is_campaign_gm") OR (EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "character_rest_state"."character_id") AND ("c"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))));



ALTER TABLE "public"."characters" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "characters_delete" ON "public"."characters" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("characters"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "characters_insert" ON "public"."characters" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("characters"."campaign_id") AS "is_campaign_gm") OR (("owner_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_campaign_member"("characters"."campaign_id") AS "is_campaign_member"))));



CREATE POLICY "characters_select" ON "public"."characters" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_member"("characters"."campaign_id") AS "is_campaign_member")));



CREATE POLICY "characters_update" ON "public"."characters" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("characters"."campaign_id") AS "is_campaign_gm") OR ("owner_id" = ( SELECT "auth"."uid"() AS "uid")))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("characters"."campaign_id") AS "is_campaign_gm") OR (("owner_id" = ( SELECT "auth"."uid"() AS "uid")) AND ( SELECT "private"."is_campaign_member"("characters"."campaign_id") AS "is_campaign_member"))));



ALTER TABLE "public"."combat_actions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_actions_delete" ON "public"."combat_actions" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_actions"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_actions_insert" ON "public"."combat_actions" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_actions"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_actions_select" ON "public"."combat_actions" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_actions"."campaign_id") AS "is_campaign_gm") OR ("player_visible" AND ( SELECT "private"."is_campaign_member"("combat_actions"."campaign_id") AS "is_campaign_member"))));



CREATE POLICY "combat_actions_update" ON "public"."combat_actions" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_actions"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_actions"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."combat_ammunition_spends" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_ammunition_spends_read" ON "public"."combat_ammunition_spends" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"(( SELECT "combat_instances"."campaign_id"
   FROM "public"."combat_instances"
  WHERE ("combat_instances"."id" = "combat_ammunition_spends"."combat_id")))));



ALTER TABLE "public"."combat_animation_cues" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."combat_area_effects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_area_effects_read" ON "public"."combat_area_effects" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_member"("campaign_id")));



CREATE POLICY "combat_area_effects_write" ON "public"."combat_area_effects" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."combat_area_events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_area_events_read" ON "public"."combat_area_events" FOR SELECT TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_member"("campaign_id")));



CREATE POLICY "combat_area_events_write" ON "public"."combat_area_events" TO "authenticated" USING (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id"))) WITH CHECK (("private"."is_admin"() OR "private"."is_campaign_gm"("campaign_id")));



ALTER TABLE "public"."combat_hexes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_hexes_delete" ON "public"."combat_hexes" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_hexes"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_hexes_insert" ON "public"."combat_hexes" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_hexes"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_hexes_select" ON "public"."combat_hexes" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_member"("combat_hexes"."campaign_id") AS "is_campaign_member")));



CREATE POLICY "combat_hexes_update" ON "public"."combat_hexes" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_hexes"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_hexes"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."combat_instances" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_instances_delete" ON "public"."combat_instances" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_instances"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_instances_insert" ON "public"."combat_instances" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_instances"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_instances_select" ON "public"."combat_instances" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_member"("combat_instances"."campaign_id") AS "is_campaign_member")));



CREATE POLICY "combat_instances_update" ON "public"."combat_instances" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_instances"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_instances"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."combat_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combat_log_delete" ON "public"."combat_log" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_log"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_log_insert" ON "public"."combat_log" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_log"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combat_log_select" ON "public"."combat_log" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_log"."campaign_id") AS "is_campaign_gm") OR ("player_visible" AND ( SELECT "private"."is_campaign_member"("combat_log"."campaign_id") AS "is_campaign_member"))));



CREATE POLICY "combat_log_update" ON "public"."combat_log" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_log"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combat_log"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."combatant_battle_poses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combatant_battle_poses_admin_delete" ON "public"."combatant_battle_poses" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "combatant_battle_poses_admin_insert" ON "public"."combatant_battle_poses" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "combatant_battle_poses_admin_read" ON "public"."combatant_battle_poses" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "combatant_battle_poses_admin_update" ON "public"."combatant_battle_poses" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "combatant_battle_poses_published_campaign_read" ON "public"."combatant_battle_poses" FOR SELECT TO "authenticated" USING ((("publication_status" = 'published'::"text") AND ("is_active" = true) AND ("image_path" IS NOT NULL) AND ((("combatant_type" = ANY (ARRAY['character'::"text", 'character-npc'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."characters" "c"
  WHERE (("c"."id" = "combatant_battle_poses"."combatant_id") AND "private"."is_campaign_member"("c"."campaign_id"))))) OR (("combatant_type" = 'campaign-npc'::"text") AND (EXISTS ( SELECT 1
   FROM "public"."campaign_npcs" "n"
  WHERE (("n"."id" = "combatant_battle_poses"."combatant_id") AND "private"."is_campaign_member"("n"."campaign_id"))))) OR (("combatant_type" = ANY (ARRAY['enemy'::"text", 'monster'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_monsters" "m"
  WHERE (("m"."id" = "combatant_battle_poses"."combatant_id") AND "private"."is_campaign_member"("m"."campaign_id"))))))));



ALTER TABLE "public"."combatant_effects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combatant_effects_delete" ON "public"."combatant_effects" FOR DELETE USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatant_effects"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combatant_effects_insert" ON "public"."combatant_effects" FOR INSERT WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatant_effects"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combatant_effects_read" ON "public"."combatant_effects" FOR SELECT USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatant_effects"."campaign_id") AS "is_campaign_gm") OR (( SELECT "private"."is_campaign_member"("combatant_effects"."campaign_id") AS "is_campaign_member") AND (EXISTS ( SELECT 1
   FROM "public"."combatants" "c"
  WHERE (("c"."id" = "combatant_effects"."combatant_id") AND (("c"."side" = 'heroes'::"text") OR "c"."visible_to_players" OR ("c"."controller_user_id" = ( SELECT "auth"."uid"() AS "uid")))))))));



CREATE POLICY "combatant_effects_update" ON "public"."combatant_effects" FOR UPDATE USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatant_effects"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatant_effects"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."combatants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "combatants_delete" ON "public"."combatants" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatants"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combatants_insert" ON "public"."combatants" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatants"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "combatants_select" ON "public"."combatants" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatants"."campaign_id") AS "is_campaign_gm") OR (( SELECT "private"."is_campaign_member"("combatants"."campaign_id") AS "is_campaign_member") AND (("side" = 'heroes'::"text") OR "visible_to_players" OR ("controller_user_id" = ( SELECT "auth"."uid"() AS "uid"))))));



CREATE POLICY "combatants_update" ON "public"."combatants" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatants"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("combatants"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."global_npcs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "global_npcs_admin_write" ON "public"."global_npcs" TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "global_npcs_read" ON "public"."global_npcs" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM "public"."campaigns" "c"
  WHERE "private"."is_campaign_gm"("c"."id")))));



CREATE POLICY "hermes_alea_job_read" ON "public"."hermes_alea_jobs" FOR SELECT TO "authenticated" USING ("private"."hermes_alea_can_manage"("target_kind", "target_id"));



ALTER TABLE "public"."hermes_alea_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hermes_animation_admin_update" ON "public"."combat_animation_cues" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "hermes_animation_authenticated_read" ON "public"."combat_animation_cues" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "hermes_events_admin_read" ON "public"."hermes_job_events" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."hermes_job_events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."hermes_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hermes_jobs_admin_read" ON "public"."hermes_jobs" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."hermes_web_jobs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "hermes_web_jobs_admin_insert" ON "public"."hermes_web_jobs" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") AND ("requested_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("state" = 'queued'::"text") AND ("attempts" = 0) AND ("archive_drive_file_id" IS NULL) AND ("output_path" IS NULL) AND ("error_code" IS NULL) AND ("completed_at" IS NULL) AND ("source_sha256" IS NULL) AND ((("pose_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."combatant_battle_poses" "p"
  WHERE (("p"."id" = "hermes_web_jobs"."pose_id") AND ((("p"."staging_path" = "hermes_web_jobs"."source_path") AND ("p"."publication_status" = ANY (ARRAY['draft'::"text", 'queued'::"text"]))) OR (("p"."pending_staging_path" = "hermes_web_jobs"."source_path") AND ("p"."publication_status" = 'published'::"text"))))))) OR (("race_pose_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."race_battle_poses" "p"
  WHERE (("p"."id" = "hermes_web_jobs"."race_pose_id") AND ((("p"."staging_path" = "hermes_web_jobs"."source_path") AND ("p"."publication_status" = ANY (ARRAY['draft'::"text", 'queued'::"text"]))) OR (("p"."pending_staging_path" = "hermes_web_jobs"."source_path") AND ("p"."publication_status" = 'published'::"text"))))))))));



CREATE POLICY "hermes_web_jobs_admin_select" ON "public"."hermes_web_jobs" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "hit_figure_admin_delete" ON "public"."rule_hit_figure_images" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "hit_figure_admin_insert" ON "public"."rule_hit_figure_images" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "hit_figure_admin_update" ON "public"."rule_hit_figure_images" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "hit_figure_read" ON "public"."rule_hit_figure_images" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."honor_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "honor_definitions_admin_delete" ON "public"."honor_definitions" FOR DELETE TO "authenticated" USING ((("status" = 'draft'::"text") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."honor_grants" "g"
  WHERE ("g"."honor_id" = "honor_definitions"."id")))) AND ("private"."is_admin"() OR (("campaign_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."campaign_id" = "honor_definitions"."campaign_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))))));



CREATE POLICY "honor_definitions_admin_insert" ON "public"."honor_definitions" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."is_admin" = true)))) OR (("campaign_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."campaign_id" = "honor_definitions"."campaign_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))))));



CREATE POLICY "honor_definitions_admin_select" ON "public"."honor_definitions" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."is_admin" = true)))) OR (("campaign_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."campaign_id" = "honor_definitions"."campaign_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text")))))));



CREATE POLICY "honor_definitions_admin_update" ON "public"."honor_definitions" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."is_admin" = true)))) OR (("campaign_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."campaign_id" = "honor_definitions"."campaign_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."is_admin" = true)))) OR (("campaign_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."campaign_id" = "honor_definitions"."campaign_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text")))))));



CREATE POLICY "honor_definitions_global_relief_gm_select" ON "public"."honor_definitions" FOR SELECT TO "authenticated" USING ((("campaign_id" IS NULL) AND ("lower"("name") = ANY (ARRAY['arcane laurel badge'::"text", 'sir robin'::"text", 'sir robin award'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))));



CREATE POLICY "honor_definitions_global_relief_gm_update" ON "public"."honor_definitions" FOR UPDATE TO "authenticated" USING ((("campaign_id" IS NULL) AND ("lower"("name") = ANY (ARRAY['arcane laurel badge'::"text", 'sir robin'::"text", 'sir robin award'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text")))))) WITH CHECK ((("campaign_id" IS NULL) AND ("lower"("name") = ANY (ARRAY['arcane laurel badge'::"text", 'sir robin'::"text", 'sir robin award'::"text"])) AND (EXISTS ( SELECT 1
   FROM "public"."campaign_members" "m"
  WHERE (("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))));



ALTER TABLE "public"."honor_grants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "honor_grants_gm_insert" ON "public"."honor_grants" FOR INSERT TO "authenticated" WITH CHECK ((("granted_by" = ( SELECT "auth"."uid"() AS "uid")) AND (EXISTS ( SELECT 1
   FROM ("public"."honor_definitions" "d"
     JOIN "public"."characters" "c" ON (("c"."id" = "honor_grants"."character_id")))
  WHERE (("d"."id" = "honor_grants"."honor_id") AND (("d"."campaign_id" IS NULL) OR ("d"."campaign_id" = "c"."campaign_id")) AND ((EXISTS ( SELECT 1
           FROM "public"."profiles" "p"
          WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."is_admin" = true)))) OR (EXISTS ( SELECT 1
           FROM "public"."campaign_members" "m"
          WHERE (("m"."campaign_id" = "c"."campaign_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))))))));



CREATE POLICY "honor_grants_gm_select" ON "public"."honor_grants" FOR SELECT TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = ( SELECT "auth"."uid"() AS "uid")) AND ("p"."is_admin" = true)))) OR (EXISTS ( SELECT 1
   FROM ("public"."characters" "c"
     JOIN "public"."campaign_members" "m" ON (("m"."campaign_id" = "c"."campaign_id")))
  WHERE (("c"."id" = "honor_grants"."character_id") AND ("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))));



ALTER TABLE "public"."honor_relief_variants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "honor_relief_variants_manager_access" ON "public"."honor_relief_variants" TO "authenticated" USING (("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."honor_definitions" "d"
     JOIN "public"."campaign_members" "m" ON ((("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))
  WHERE (("d"."id" = "honor_relief_variants"."honor_id") AND (("d"."campaign_id" = "m"."campaign_id") OR (("d"."campaign_id" IS NULL) AND ("lower"("d"."name") = ANY (ARRAY['arcane laurel badge'::"text", 'sir robin'::"text", 'sir robin award'::"text"]))))))))) WITH CHECK (("private"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."honor_definitions" "d"
     JOIN "public"."campaign_members" "m" ON ((("m"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("m"."role" = 'gm'::"text"))))
  WHERE (("d"."id" = "honor_relief_variants"."honor_id") AND (("d"."campaign_id" = "m"."campaign_id") OR (("d"."campaign_id" IS NULL) AND ("lower"("d"."name") = ANY (ARRAY['arcane laurel badge'::"text", 'sir robin'::"text", 'sir robin award'::"text"])))))))));



CREATE POLICY "journal_insert" ON "public"."campaign_journal_entries" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = ( SELECT "auth"."uid"() AS "uid")) AND ("source_key" IS NULL) AND (( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_journal_entries"."campaign_id") AS "is_campaign_gm") OR (("event_type" = ANY (ARRAY['skill'::"text", 'spell'::"text", 'dice'::"text"])) AND "player_visible" AND ( SELECT "private"."is_campaign_member"("campaign_journal_entries"."campaign_id") AS "is_campaign_member")))));



CREATE POLICY "journal_read" ON "public"."campaign_journal_entries" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_journal_entries"."campaign_id") AS "is_campaign_gm") OR ("player_visible" AND ( SELECT "private"."is_campaign_member"("campaign_journal_entries"."campaign_id") AS "is_campaign_member"))));



CREATE POLICY "magic_artifact_powers_delete" ON "public"."rule_magic_artifact_powers" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_artifact_powers_insert" ON "public"."rule_magic_artifact_powers" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_artifact_powers_select" ON "public"."rule_magic_artifact_powers" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_artifact_powers_update" ON "public"."rule_magic_artifact_powers" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_property_definitions_delete" ON "public"."rule_magic_property_definitions" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_property_definitions_insert" ON "public"."rule_magic_property_definitions" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_property_definitions_select" ON "public"."rule_magic_property_definitions" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "magic_property_definitions_update" ON "public"."rule_magic_property_definitions" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "members_delete" ON "public"."campaign_members" FOR DELETE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_members"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "members_insert" ON "public"."campaign_members" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_members"."campaign_id") AS "is_campaign_gm")));



CREATE POLICY "members_select" ON "public"."campaign_members" FOR SELECT TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_member"("campaign_members"."campaign_id") AS "is_campaign_member")));



CREATE POLICY "members_update" ON "public"."campaign_members" FOR UPDATE TO "authenticated" USING ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_members"."campaign_id") AS "is_campaign_gm"))) WITH CHECK ((( SELECT "private"."is_admin"() AS "is_admin") OR ( SELECT "private"."is_campaign_gm"("campaign_members"."campaign_id") AS "is_campaign_gm")));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin") OR (EXISTS ( SELECT 1
   FROM ("public"."campaign_members" "me"
     JOIN "public"."campaign_members" "them" ON (("them"."campaign_id" = "me"."campaign_id")))
  WHERE (("me"."user_id" = ( SELECT "auth"."uid"() AS "uid")) AND ("them"."user_id" = "profiles"."id"))))));



CREATE POLICY "profiles_update" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin"))) WITH CHECK ((("id" = ( SELECT "auth"."uid"() AS "uid")) OR ( SELECT "private"."is_admin"() AS "is_admin")));



ALTER TABLE "public"."race_battle_poses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "race_pose_admin_insert" ON "public"."race_battle_poses" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "race_pose_admin_select" ON "public"."race_battle_poses" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "race_pose_admin_update" ON "public"."race_battle_poses" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "race_pose_published_read" ON "public"."race_battle_poses" FOR SELECT TO "authenticated" USING (("is_active" AND ("publication_status" = 'published'::"text") AND ("image_path" IS NOT NULL)));



CREATE POLICY "round_backgrounds_admin_insert" ON "public"."rule_combat_round_backgrounds" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "round_backgrounds_admin_update" ON "public"."rule_combat_round_backgrounds" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "round_backgrounds_read" ON "public"."rule_combat_round_backgrounds" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."rule_armor_materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_armor_materials_delete" ON "public"."rule_armor_materials" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_armor_materials_insert" ON "public"."rule_armor_materials" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_armor_materials_select" ON "public"."rule_armor_materials" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_armor_materials_update" ON "public"."rule_armor_materials" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_armor_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_armor_types_delete" ON "public"."rule_armor_types" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_armor_types_insert" ON "public"."rule_armor_types" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_armor_types_select" ON "public"."rule_armor_types" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_armor_types_update" ON "public"."rule_armor_types" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_combat_fumbles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_combat_fumbles_delete" ON "public"."rule_combat_fumbles" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_combat_fumbles_insert" ON "public"."rule_combat_fumbles" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_combat_fumbles_select" ON "public"."rule_combat_fumbles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_combat_fumbles_update" ON "public"."rule_combat_fumbles" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_combat_round_backgrounds" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rule_effects" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_effects_admin_write" ON "public"."rule_effects" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_effects_read" ON "public"."rule_effects" FOR SELECT USING (true);



ALTER TABLE "public"."rule_hit_figure_images" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rule_inn_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_inn_items_delete_admin" ON "public"."rule_inn_items" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "rule_inn_items_insert_admin" ON "public"."rule_inn_items" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "rule_inn_items_read" ON "public"."rule_inn_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_inn_items_update_admin" ON "public"."rule_inn_items" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."rule_magic_artifact_powers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rule_magic_artifacts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_magic_artifacts_delete_admin" ON "public"."rule_magic_artifacts" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_magic_artifacts_insert_admin" ON "public"."rule_magic_artifacts" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_magic_artifacts_select_admin" ON "public"."rule_magic_artifacts" FOR SELECT TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_magic_artifacts_update_admin" ON "public"."rule_magic_artifacts" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_magic_property_definitions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rule_magic_schools" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_magic_schools_admin_write" ON "public"."rule_magic_schools" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_admin")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_admin"))));



CREATE POLICY "rule_magic_schools_read" ON "public"."rule_magic_schools" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."rule_magic_symbols" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_magic_symbols_read" ON "public"."rule_magic_symbols" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."rule_professions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_professions_delete_admin" ON "public"."rule_professions" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "rule_professions_insert_admin" ON "public"."rule_professions" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "rule_professions_read" ON "public"."rule_professions" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_professions_update_admin" ON "public"."rule_professions" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."rule_projectile_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_projectile_types_admin" ON "public"."rule_projectile_types" TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



CREATE POLICY "rule_projectile_types_read" ON "public"."rule_projectile_types" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."rule_race_attributes" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_race_attributes_delete_admin" ON "public"."rule_race_attributes" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "rule_race_attributes_insert_admin" ON "public"."rule_race_attributes" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "rule_race_attributes_read" ON "public"."rule_race_attributes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_race_attributes_update_admin" ON "public"."rule_race_attributes" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."rule_races" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_races_delete_admin" ON "public"."rule_races" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "rule_races_insert_admin" ON "public"."rule_races" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "rule_races_read" ON "public"."rule_races" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_races_update_admin" ON "public"."rule_races" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."rule_shields" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_shields_delete" ON "public"."rule_shields" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_shields_insert" ON "public"."rule_shields" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_shields_select" ON "public"."rule_shields" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_shields_update" ON "public"."rule_shields" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_shop_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_shop_items_delete" ON "public"."rule_shop_items" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_shop_items_insert" ON "public"."rule_shop_items" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_shop_items_select" ON "public"."rule_shop_items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_shop_items_update" ON "public"."rule_shop_items" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_skills" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_skills_delete_admin" ON "public"."rule_skills" FOR DELETE TO "authenticated" USING ("private"."is_admin"());



CREATE POLICY "rule_skills_insert_admin" ON "public"."rule_skills" FOR INSERT TO "authenticated" WITH CHECK ("private"."is_admin"());



CREATE POLICY "rule_skills_read" ON "public"."rule_skills" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_skills_update_admin" ON "public"."rule_skills" FOR UPDATE TO "authenticated" USING ("private"."is_admin"()) WITH CHECK ("private"."is_admin"());



ALTER TABLE "public"."rule_social_stands" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_social_stands_delete" ON "public"."rule_social_stands" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_social_stands_insert" ON "public"."rule_social_stands" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_social_stands_select" ON "public"."rule_social_stands" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_social_stands_update" ON "public"."rule_social_stands" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_sound_cues" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_sound_cues_admin_delete" ON "public"."rule_sound_cues" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_sound_cues_admin_insert" ON "public"."rule_sound_cues" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_sound_cues_admin_update" ON "public"."rule_sound_cues" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_sound_cues_read" ON "public"."rule_sound_cues" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."rule_spells" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_spells_admin_write" ON "public"."rule_spells" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_admin")))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND "p"."is_admin"))));



CREATE POLICY "rule_spells_read" ON "public"."rule_spells" FOR SELECT TO "authenticated" USING (true);



ALTER TABLE "public"."rule_weapon_materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_weapon_materials_delete" ON "public"."rule_weapon_materials" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_weapon_materials_insert" ON "public"."rule_weapon_materials" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_weapon_materials_select" ON "public"."rule_weapon_materials" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_weapon_materials_update" ON "public"."rule_weapon_materials" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



ALTER TABLE "public"."rule_weapons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rule_weapons_delete" ON "public"."rule_weapons" FOR DELETE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_weapons_insert" ON "public"."rule_weapons" FOR INSERT TO "authenticated" WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));



CREATE POLICY "rule_weapons_select" ON "public"."rule_weapons" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rule_weapons_update" ON "public"."rule_weapons" FOR UPDATE TO "authenticated" USING (( SELECT "private"."is_admin"() AS "is_admin")) WITH CHECK (( SELECT "private"."is_admin"() AS "is_admin"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "private" TO "authenticated";
GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "private"."append_combat_to_journal"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."append_day_to_journal"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."bump_campaign_map_signal"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."haj_area_event"("p_area" "uuid", "p_combatant" "uuid", "p_round" integer, "p_event" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."hermes_alea_begin"("request" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."hermes_alea_begin"("request" "jsonb") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."hermes_alea_can_manage"("kind" "text", "target" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."hermes_alea_can_manage"("kind" "text", "target" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."hermes_alea_capabilities"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."hermes_alea_capabilities"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."hermes_alea_finalize"("job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."hermes_alea_finalize"("job_id" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."hermes_alea_guard"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."hermes_alea_link_guard"() FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."hermes_alea_storage_allowed"("bucket" "text", "path" "text", "reading" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."hermes_alea_storage_allowed"("bucket" "text", "path" "text", "reading" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "private"."hermes_alea_target_lock"("kind" "text", "target" "uuid") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."hermes_alea_target_set"("kind" "text", "target" "uuid", "newkey" "text") FROM PUBLIC;



REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_admin"() TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_campaign_gm"("p_campaign" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_campaign_gm"("p_campaign" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."is_campaign_member"("p_campaign" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "private"."is_campaign_member"("p_campaign" "uuid") TO "authenticated";



REVOKE ALL ON FUNCTION "private"."sync_character_round_art_live"() FROM PUBLIC;



GRANT ALL ON FUNCTION "public"."activate_campaign_map"("p_map_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."activate_campaign_map"("p_map_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."activate_campaign_map"("p_map_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."add_global_npc_to_campaign"("p_global_npc_id" "uuid", "p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."add_global_npc_to_campaign"("p_global_npc_id" "uuid", "p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_global_npc_to_campaign"("p_global_npc_id" "uuid", "p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_global_npc_to_campaign"("p_global_npc_id" "uuid", "p_campaign_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."advance_campaign_day"("p_campaign_id" "uuid", "p_weather" "text", "p_rest_hours" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."advance_campaign_day"("p_campaign_id" "uuid", "p_weather" "text", "p_rest_hours" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."advance_campaign_day"("p_campaign_id" "uuid", "p_weather" "text", "p_rest_hours" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_campaign_day"("p_campaign_id" "uuid", "p_weather" "text", "p_rest_hours" numeric) TO "service_role";



GRANT ALL ON FUNCTION "public"."alea_create_location_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."alea_create_location_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."alea_create_location_state"() TO "service_role";



GRANT ALL ON FUNCTION "public"."alea_footprint_cells"("p_q" integer, "p_r" integer, "p_shape" "text", "p_facing" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."alea_footprint_cells"("p_q" integer, "p_r" integer, "p_shape" "text", "p_facing" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."alea_footprint_cells"("p_q" integer, "p_r" integer, "p_shape" "text", "p_facing" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."alea_footprint_shape"("p_state" "jsonb", "p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."alea_footprint_shape"("p_state" "jsonb", "p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."alea_footprint_shape"("p_state" "jsonb", "p_name" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."alea_move_multhex"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alea_move_multhex"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."alea_move_multhex"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."alea_move_multhex"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."alea_rotate_multhex"("p_combatant_id" "uuid", "p_facing" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."alea_rotate_multhex"("p_combatant_id" "uuid", "p_facing" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."alea_rotate_multhex"("p_combatant_id" "uuid", "p_facing" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."alea_rotate_multhex"("p_combatant_id" "uuid", "p_facing" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."alea_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."alea_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."alea_set_updated_at"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."aragorn_sync_legacy_materials"("p_campaign_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."aragorn_sync_legacy_materials"("p_campaign_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."aragorn_sync_legacy_materials"("p_campaign_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."aragorn_sync_legacy_materials"("p_campaign_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."arcane_gallery_capture_presentation"() TO "anon";
GRANT ALL ON FUNCTION "public"."arcane_gallery_capture_presentation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."arcane_gallery_capture_presentation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."award_character_erf"("p_character_id" "uuid", "p_item_group" "text", "p_item_key" "text", "p_amount" integer, "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."award_character_erf"("p_character_id" "uuid", "p_item_group" "text", "p_item_key" "text", "p_amount" integer, "p_reason" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."award_character_erf"("p_character_id" "uuid", "p_item_group" "text", "p_item_key" "text", "p_amount" integer, "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."award_character_erf"("p_character_id" "uuid", "p_item_group" "text", "p_item_key" "text", "p_amount" integer, "p_reason" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."bilbo_guard_material_archive"() TO "anon";
GRANT ALL ON FUNCTION "public"."bilbo_guard_material_archive"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."bilbo_guard_material_archive"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."combat_finish_and_recover"("p_combat_id" "uuid", "p_allow_recovery" boolean, "p_percent" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."combat_finish_and_recover"("p_combat_id" "uuid", "p_allow_recovery" boolean, "p_percent" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."combat_finish_and_recover"("p_combat_id" "uuid", "p_allow_recovery" boolean, "p_percent" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."combat_finish_and_recover"("p_combat_id" "uuid", "p_allow_recovery" boolean, "p_percent" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."combat_refund_ammunition"("p_action_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."combat_refund_ammunition"("p_action_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."combat_refund_ammunition"("p_action_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."combat_refund_ammunition"("p_action_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."combat_spend_ammunition"("p_action_id" "uuid", "p_weapon_key" "text", "p_projectile_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."combat_spend_ammunition"("p_action_id" "uuid", "p_weapon_key" "text", "p_projectile_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."combat_spend_ammunition"("p_action_id" "uuid", "p_weapon_key" "text", "p_projectile_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."combat_spend_ammunition"("p_action_id" "uuid", "p_weapon_key" "text", "p_projectile_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_character_provisions_on_day_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_character_provisions_on_day_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."consume_character_provisions_on_day_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."consume_character_provisions_on_day_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."frodo_set_presentation"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_expected_revision" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."frodo_set_presentation"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_expected_revision" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."frodo_set_presentation"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_expected_revision" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."frodo_set_presentation"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_expected_revision" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."frodo_validate_presentation"() TO "anon";
GRANT ALL ON FUNCTION "public"."frodo_validate_presentation"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."frodo_validate_presentation"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."galadriel_signal_material_change"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."galadriel_signal_material_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."galadriel_signal_material_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."galadriel_signal_material_change"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."haj_move_combatant"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."haj_move_combatant"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."haj_move_combatant"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."haj_move_combatant"("p_combatant_id" "uuid", "p_from_q" integer, "p_from_r" integer, "p_expected_remaining" numeric, "p_path" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."haj_restore_combatant"("p_combatant_id" "uuid", "p_snapshot" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."haj_restore_combatant"("p_combatant_id" "uuid", "p_snapshot" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."haj_restore_combatant"("p_combatant_id" "uuid", "p_snapshot" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."haj_restore_combatant"("p_combatant_id" "uuid", "p_snapshot" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_archive_intent"("job_id" "uuid", "token" "uuid", "drive_id" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_archive_intent"("job_id" "uuid", "token" "uuid", "drive_id" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_archive_intent"("job_id" "uuid", "token" "uuid", "drive_id" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_archive_intent"("job_id" "uuid", "token" "uuid", "drive_id" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_archive_result"("job_id" "uuid", "token" "uuid", "drive_id" "text", "failure" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_archive_result"("job_id" "uuid", "token" "uuid", "drive_id" "text", "failure" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_archive_result"("job_id" "uuid", "token" "uuid", "drive_id" "text", "failure" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_archive_result"("job_id" "uuid", "token" "uuid", "drive_id" "text", "failure" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_begin"("request" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_begin"("request" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_begin"("request" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_begin"("request" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_capabilities"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_capabilities"() TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_capabilities"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_capabilities"() TO "service_role";



GRANT ALL ON TABLE "public"."hermes_alea_jobs" TO "anon";
GRANT ALL ON TABLE "public"."hermes_alea_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_alea_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_claim"("batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_claim"("batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_claim"("batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_claim"("batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_cleanup"("job_id" "uuid", "kind" "text", "action" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_cleanup"("job_id" "uuid", "kind" "text", "action" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_cleanup"("job_id" "uuid", "kind" "text", "action" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_cleanup"("job_id" "uuid", "kind" "text", "action" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_finalize"("job_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_finalize"("job_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_finalize"("job_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_finalize"("job_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_health"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_health"() TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_health"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_health"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_inventory"("page_offset" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_inventory"("page_offset" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_inventory"("page_offset" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_inventory"("page_offset" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_remove"("request" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_remove"("request" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_remove"("request" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_remove"("request" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_alea_verify"("job_id" "uuid", "receipt" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_alea_verify"("job_id" "uuid", "receipt" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_alea_verify"("job_id" "uuid", "receipt" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_alea_verify"("job_id" "uuid", "receipt" "jsonb") TO "service_role";



GRANT ALL ON TABLE "public"."hermes_web_jobs" TO "anon";
GRANT ALL ON TABLE "public"."hermes_web_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_web_jobs" TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_claim_web_jobs"("batch_size" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_claim_web_jobs"("batch_size" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_claim_web_jobs"("batch_size" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_claim_web_jobs"("batch_size" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_core_system_image_create"("p_asset_key" "text", "p_label" "text", "p_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_create"("p_asset_key" "text", "p_label" "text", "p_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_create"("p_asset_key" "text", "p_label" "text", "p_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_create"("p_asset_key" "text", "p_label" "text", "p_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_core_system_image_read"("p_asset_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_read"("p_asset_key" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_read"("p_asset_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_read"("p_asset_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."hermes_core_system_image_set"("p_asset_key" "text", "p_expected_revision" bigint, "p_expected_path" "text", "p_new_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_set"("p_asset_key" "text", "p_expected_revision" bigint, "p_expected_path" "text", "p_new_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_set"("p_asset_key" "text", "p_expected_revision" bigint, "p_expected_path" "text", "p_new_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."hermes_core_system_image_set"("p_asset_key" "text", "p_expected_revision" bigint, "p_expected_path" "text", "p_new_path" "text", "p_sha256" "text", "p_bytes" integer, "p_width" integer, "p_height" integer, "p_alpha_preserved" boolean) TO "service_role";



REVOKE ALL ON FUNCTION "public"."init_campaign_day_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."init_campaign_day_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."init_campaign_day_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_campaign_day_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."init_character_rest_state"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."init_character_rest_state"() TO "anon";
GRANT ALL ON FUNCTION "public"."init_character_rest_state"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."init_character_rest_state"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."material_storage_path_valid"("p_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."material_storage_path_valid"("p_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."material_storage_path_valid"("p_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."material_storage_path_valid"("p_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_shared_material_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_shared_material_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_shared_material_delete"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."protect_magic_property_kind"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."protect_magic_property_kind"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_magic_property_kind"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_magic_property_kind"() TO "service_role";



GRANT ALL ON FUNCTION "public"."reset_campaign_time_on_new_day"() TO "anon";
GRANT ALL ON FUNCTION "public"."reset_campaign_time_on_new_day"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."reset_campaign_time_on_new_day"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_combat_area_stay"("p_combatant_id" "uuid", "p_round" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_combat_area_stay"("p_combatant_id" "uuid", "p_round" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_combat_area_stay"("p_combatant_id" "uuid", "p_round" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_combat_area_stay"("p_combatant_id" "uuid", "p_round" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."resolve_combat_dot"("p_effect_id" "uuid", "p_round" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."resolve_combat_dot"("p_effect_id" "uuid", "p_round" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."resolve_combat_dot"("p_effect_id" "uuid", "p_round" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."resolve_combat_dot"("p_effect_id" "uuid", "p_round" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reveal_campaign_map"("p_map_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reveal_campaign_map"("p_map_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reveal_campaign_map"("p_map_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reveal_campaign_map"("p_map_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."rule_strength_group"("p_strength" numeric) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rule_strength_group"("p_strength" numeric) TO "anon";
GRANT ALL ON FUNCTION "public"."rule_strength_group"("p_strength" numeric) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_strength_group"("p_strength" numeric) TO "service_role";



REVOKE ALL ON FUNCTION "public"."rule_weapon_grip"("p_handling" "text", "p_weapon_strength_group" integer, "p_character_strength_group" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."rule_weapon_grip"("p_handling" "text", "p_weapon_strength_group" integer, "p_character_strength_group" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."rule_weapon_grip"("p_handling" "text", "p_weapon_strength_group" integer, "p_character_strength_group" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."rule_weapon_grip"("p_handling" "text", "p_weapon_strength_group" integer, "p_character_strength_group" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."sam_guard_material_share"() TO "anon";
GRANT ALL ON FUNCTION "public"."sam_guard_material_share"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sam_guard_material_share"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."sam_set_material_share"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_shared" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."sam_set_material_share"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_shared" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."sam_set_material_share"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_shared" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."sam_set_material_share"("p_campaign_id" "uuid", "p_material_id" "uuid", "p_shared" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."seed_rule_race_attribute_rows"() TO "anon";
GRANT ALL ON FUNCTION "public"."seed_rule_race_attribute_rows"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."seed_rule_race_attribute_rows"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_campaign_time_of_day"("p_campaign_id" "uuid", "p_time_of_day" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_campaign_time_of_day"("p_campaign_id" "uuid", "p_time_of_day" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_campaign_time_of_day"("p_campaign_id" "uuid", "p_time_of_day" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campaign_time_of_day"("p_campaign_id" "uuid", "p_time_of_day" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."set_campaign_weather"("p_campaign_id" "uuid", "p_weather" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_campaign_weather"("p_campaign_id" "uuid", "p_weather" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_campaign_weather"("p_campaign_id" "uuid", "p_weather" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_campaign_weather"("p_campaign_id" "uuid", "p_weather" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."update_map_polygon_shapes_atomic"("p_map_id" "uuid", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."update_map_polygon_shapes_atomic"("p_map_id" "uuid", "p_changes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_map_polygon_shapes_atomic"("p_map_id" "uuid", "p_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_map_polygon_shapes_atomic"("p_map_id" "uuid", "p_changes" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_campaign_image_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_campaign_image_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_campaign_image_link"() TO "service_role";



GRANT ALL ON FUNCTION "public"."validate_campaign_material_link"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_campaign_material_link"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_campaign_material_link"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."validate_magic_artifact_power"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."validate_magic_artifact_power"() TO "anon";
GRANT ALL ON FUNCTION "public"."validate_magic_artifact_power"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."validate_magic_artifact_power"() TO "service_role";


















GRANT SELECT ON TABLE "private"."hermes_alea_settings" TO "service_role";



GRANT ALL ON TABLE "public"."arcane_system_assets" TO "anon";
GRANT ALL ON TABLE "public"."arcane_system_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT INSERT("id") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT INSERT("asset_key") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT INSERT("label") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT UPDATE("asset_path") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT UPDATE("app_sha256") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT UPDATE("app_bytes") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT UPDATE("width") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT UPDATE("height") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT UPDATE("alpha_preserved") ON TABLE "public"."arcane_system_assets" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_audio_events" TO "anon";
GRANT ALL ON TABLE "public"."campaign_audio_events" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_audio_events" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_audio_state" TO "anon";
GRANT ALL ON TABLE "public"."campaign_audio_state" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_audio_state" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_combat_scene_characters" TO "anon";
GRANT ALL ON TABLE "public"."campaign_combat_scene_characters" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_combat_scene_characters" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_combat_scene_combatants" TO "anon";
GRANT ALL ON TABLE "public"."campaign_combat_scene_combatants" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_combat_scene_combatants" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_combat_scene_hexes" TO "anon";
GRANT ALL ON TABLE "public"."campaign_combat_scene_hexes" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_combat_scene_hexes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_combat_scene_monsters" TO "anon";
GRANT ALL ON TABLE "public"."campaign_combat_scene_monsters" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_combat_scene_monsters" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_combat_scene_npcs" TO "anon";
GRANT ALL ON TABLE "public"."campaign_combat_scene_npcs" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_combat_scene_npcs" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_combat_scenes" TO "anon";
GRANT ALL ON TABLE "public"."campaign_combat_scenes" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_combat_scenes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_day_history" TO "anon";
GRANT ALL ON TABLE "public"."campaign_day_history" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_day_history" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_day_state" TO "anon";
GRANT ALL ON TABLE "public"."campaign_day_state" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_day_state" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_event_combat_hexes" TO "anon";
GRANT ALL ON TABLE "public"."campaign_event_combat_hexes" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_event_combat_hexes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_event_combat_spawns" TO "anon";
GRANT ALL ON TABLE "public"."campaign_event_combat_spawns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_event_combat_spawns" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_event_combats" TO "anon";
GRANT ALL ON TABLE "public"."campaign_event_combats" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_event_combats" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_event_enemies" TO "anon";
GRANT ALL ON TABLE "public"."campaign_event_enemies" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_event_enemies" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_events" TO "anon";
GRANT ALL ON TABLE "public"."campaign_events" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_events" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_image_links" TO "anon";
GRANT ALL ON TABLE "public"."campaign_image_links" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_image_links" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_images" TO "anon";
GRANT ALL ON TABLE "public"."campaign_images" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_images" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_journal_entries" TO "anon";
GRANT ALL ON TABLE "public"."campaign_journal_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_journal_entries" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_assets" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_assets" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_event_links" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_event_links" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_event_links" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_events" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_events" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_events" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_gm_notes" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_gm_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_gm_notes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_monster_links" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_monster_links" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_monster_links" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_npc_links" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_npc_links" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_npc_links" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_player_texts" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_player_texts" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_player_texts" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_location_state" TO "anon";
GRANT ALL ON TABLE "public"."campaign_location_state" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_location_state" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_locations" TO "anon";
GRANT ALL ON TABLE "public"."campaign_locations" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_locations" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_map_areas" TO "anon";
GRANT ALL ON TABLE "public"."campaign_map_areas" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_map_areas" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_map_settings" TO "anon";
GRANT ALL ON TABLE "public"."campaign_map_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_map_settings" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_map_signals" TO "anon";
GRANT ALL ON TABLE "public"."campaign_map_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_map_signals" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_maps" TO "anon";
GRANT ALL ON TABLE "public"."campaign_maps" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_maps" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_material_gm_notes" TO "anon";
GRANT ALL ON TABLE "public"."campaign_material_gm_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_material_gm_notes" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_material_links" TO "anon";
GRANT ALL ON TABLE "public"."campaign_material_links" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_material_links" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_material_presentation_history" TO "anon";
GRANT ALL ON TABLE "public"."campaign_material_presentation_history" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_material_presentation_history" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_material_presentations" TO "anon";
GRANT ALL ON TABLE "public"."campaign_material_presentations" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_material_presentations" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_material_shares" TO "anon";
GRANT ALL ON TABLE "public"."campaign_material_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_material_shares" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_material_signals" TO "anon";
GRANT ALL ON TABLE "public"."campaign_material_signals" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_material_signals" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_materials" TO "anon";
GRANT ALL ON TABLE "public"."campaign_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_materials" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_members" TO "anon";
GRANT ALL ON TABLE "public"."campaign_members" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_members" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_monsters" TO "anon";
GRANT ALL ON TABLE "public"."campaign_monsters" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_monsters" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_npcs" TO "anon";
GRANT ALL ON TABLE "public"."campaign_npcs" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_npcs" TO "service_role";



GRANT ALL ON TABLE "public"."campaign_sites" TO "anon";
GRANT ALL ON TABLE "public"."campaign_sites" TO "authenticated";
GRANT ALL ON TABLE "public"."campaign_sites" TO "service_role";



GRANT ALL ON TABLE "public"."campaigns" TO "anon";
GRANT ALL ON TABLE "public"."campaigns" TO "authenticated";
GRANT ALL ON TABLE "public"."campaigns" TO "service_role";



GRANT ALL ON TABLE "public"."character_erf_awards" TO "anon";
GRANT ALL ON TABLE "public"."character_erf_awards" TO "authenticated";
GRANT ALL ON TABLE "public"."character_erf_awards" TO "service_role";



GRANT ALL ON TABLE "public"."character_rest_state" TO "anon";
GRANT ALL ON TABLE "public"."character_rest_state" TO "authenticated";
GRANT ALL ON TABLE "public"."character_rest_state" TO "service_role";



GRANT ALL ON TABLE "public"."characters" TO "anon";
GRANT ALL ON TABLE "public"."characters" TO "authenticated";
GRANT ALL ON TABLE "public"."characters" TO "service_role";



GRANT ALL ON TABLE "public"."combat_actions" TO "anon";
GRANT ALL ON TABLE "public"."combat_actions" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_actions" TO "service_role";



GRANT ALL ON TABLE "public"."combat_ammunition_spends" TO "anon";
GRANT ALL ON TABLE "public"."combat_ammunition_spends" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_ammunition_spends" TO "service_role";



GRANT ALL ON TABLE "public"."combat_animation_cues" TO "anon";
GRANT ALL ON TABLE "public"."combat_animation_cues" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_animation_cues" TO "service_role";



GRANT ALL ON TABLE "public"."combat_area_effects" TO "anon";
GRANT ALL ON TABLE "public"."combat_area_effects" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_area_effects" TO "service_role";



GRANT ALL ON TABLE "public"."combat_area_events" TO "anon";
GRANT ALL ON TABLE "public"."combat_area_events" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_area_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."combat_area_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."combat_area_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."combat_area_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."combat_hexes" TO "anon";
GRANT ALL ON TABLE "public"."combat_hexes" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_hexes" TO "service_role";



GRANT ALL ON TABLE "public"."combat_instances" TO "anon";
GRANT ALL ON TABLE "public"."combat_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_instances" TO "service_role";



GRANT ALL ON TABLE "public"."combat_log" TO "anon";
GRANT ALL ON TABLE "public"."combat_log" TO "authenticated";
GRANT ALL ON TABLE "public"."combat_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."combat_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."combat_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."combat_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."combatant_battle_poses" TO "anon";
GRANT ALL ON TABLE "public"."combatant_battle_poses" TO "authenticated";
GRANT ALL ON TABLE "public"."combatant_battle_poses" TO "service_role";



GRANT ALL ON TABLE "public"."combatant_effects" TO "anon";
GRANT ALL ON TABLE "public"."combatant_effects" TO "authenticated";
GRANT ALL ON TABLE "public"."combatant_effects" TO "service_role";



GRANT ALL ON TABLE "public"."combatants" TO "anon";
GRANT ALL ON TABLE "public"."combatants" TO "authenticated";
GRANT ALL ON TABLE "public"."combatants" TO "service_role";



GRANT ALL ON TABLE "public"."global_npcs" TO "anon";
GRANT ALL ON TABLE "public"."global_npcs" TO "authenticated";
GRANT ALL ON TABLE "public"."global_npcs" TO "service_role";



GRANT ALL ON TABLE "public"."hermes_alea_assets" TO "anon";
GRANT ALL ON TABLE "public"."hermes_alea_assets" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_alea_assets" TO "service_role";



GRANT ALL ON TABLE "public"."honor_definitions" TO "anon";
GRANT ALL ON TABLE "public"."honor_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."honor_definitions" TO "service_role";



GRANT UPDATE("image_asset_id") ON TABLE "public"."honor_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."honor_relief_variants" TO "anon";
GRANT ALL ON TABLE "public"."honor_relief_variants" TO "authenticated";
GRANT ALL ON TABLE "public"."honor_relief_variants" TO "service_role";



GRANT UPDATE("image_asset_id") ON TABLE "public"."honor_relief_variants" TO "service_role";



GRANT ALL ON TABLE "public"."hermes_alea_cleanup_report" TO "anon";
GRANT ALL ON TABLE "public"."hermes_alea_cleanup_report" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_alea_cleanup_report" TO "service_role";



GRANT ALL ON TABLE "public"."hermes_alea_detach_events" TO "anon";
GRANT ALL ON TABLE "public"."hermes_alea_detach_events" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_alea_detach_events" TO "service_role";



GRANT ALL ON TABLE "public"."hermes_job_events" TO "anon";
GRANT ALL ON TABLE "public"."hermes_job_events" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_job_events" TO "service_role";



GRANT ALL ON SEQUENCE "public"."hermes_job_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."hermes_job_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."hermes_job_events_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."hermes_jobs" TO "anon";
GRANT ALL ON TABLE "public"."hermes_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."hermes_jobs" TO "service_role";



GRANT ALL ON TABLE "public"."honor_grants" TO "anon";
GRANT ALL ON TABLE "public"."honor_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."honor_grants" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT UPDATE("display_name") ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."race_battle_poses" TO "anon";
GRANT ALL ON TABLE "public"."race_battle_poses" TO "authenticated";
GRANT ALL ON TABLE "public"."race_battle_poses" TO "service_role";



GRANT SELECT("id") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("race_id") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("gender_variant") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("pose_key") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("image_path") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("base_key") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("mounting_profile") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("is_active") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT SELECT("publication_status") ON TABLE "public"."race_battle_poses" TO "authenticated";



GRANT ALL ON TABLE "public"."rule_armor_materials" TO "anon";
GRANT ALL ON TABLE "public"."rule_armor_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_armor_materials" TO "service_role";



GRANT ALL ON TABLE "public"."rule_armor_types" TO "anon";
GRANT ALL ON TABLE "public"."rule_armor_types" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_armor_types" TO "service_role";



GRANT ALL ON TABLE "public"."rule_combat_fumbles" TO "anon";
GRANT ALL ON TABLE "public"."rule_combat_fumbles" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_combat_fumbles" TO "service_role";



GRANT ALL ON TABLE "public"."rule_combat_round_backgrounds" TO "anon";
GRANT ALL ON TABLE "public"."rule_combat_round_backgrounds" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_combat_round_backgrounds" TO "service_role";



GRANT ALL ON TABLE "public"."rule_effects" TO "anon";
GRANT ALL ON TABLE "public"."rule_effects" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_effects" TO "service_role";



GRANT ALL ON TABLE "public"."rule_hit_figure_images" TO "anon";
GRANT ALL ON TABLE "public"."rule_hit_figure_images" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_hit_figure_images" TO "service_role";



GRANT ALL ON TABLE "public"."rule_inn_items" TO "anon";
GRANT ALL ON TABLE "public"."rule_inn_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_inn_items" TO "service_role";



GRANT ALL ON TABLE "public"."rule_magic_artifact_powers" TO "anon";
GRANT ALL ON TABLE "public"."rule_magic_artifact_powers" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_magic_artifact_powers" TO "service_role";



GRANT ALL ON TABLE "public"."rule_magic_artifacts" TO "anon";
GRANT ALL ON TABLE "public"."rule_magic_artifacts" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_magic_artifacts" TO "service_role";



GRANT ALL ON TABLE "public"."rule_magic_property_definitions" TO "anon";
GRANT ALL ON TABLE "public"."rule_magic_property_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_magic_property_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."rule_magic_schools" TO "anon";
GRANT ALL ON TABLE "public"."rule_magic_schools" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_magic_schools" TO "service_role";



GRANT ALL ON TABLE "public"."rule_magic_symbols" TO "anon";
GRANT ALL ON TABLE "public"."rule_magic_symbols" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_magic_symbols" TO "service_role";



GRANT ALL ON TABLE "public"."rule_professions" TO "anon";
GRANT ALL ON TABLE "public"."rule_professions" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_professions" TO "service_role";



GRANT ALL ON TABLE "public"."rule_projectile_types" TO "anon";
GRANT ALL ON TABLE "public"."rule_projectile_types" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_projectile_types" TO "service_role";



GRANT ALL ON TABLE "public"."rule_race_attributes" TO "anon";
GRANT ALL ON TABLE "public"."rule_race_attributes" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_race_attributes" TO "service_role";



GRANT ALL ON TABLE "public"."rule_races" TO "anon";
GRANT ALL ON TABLE "public"."rule_races" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_races" TO "service_role";



GRANT ALL ON TABLE "public"."rule_shields" TO "anon";
GRANT ALL ON TABLE "public"."rule_shields" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_shields" TO "service_role";



GRANT ALL ON TABLE "public"."rule_shop_items" TO "anon";
GRANT ALL ON TABLE "public"."rule_shop_items" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_shop_items" TO "service_role";



GRANT ALL ON TABLE "public"."rule_skills" TO "anon";
GRANT ALL ON TABLE "public"."rule_skills" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_skills" TO "service_role";



GRANT UPDATE("icon_path") ON TABLE "public"."rule_skills" TO "service_role";



GRANT UPDATE("illustration_path") ON TABLE "public"."rule_skills" TO "service_role";



GRANT UPDATE("illustration_wide_path") ON TABLE "public"."rule_skills" TO "service_role";



GRANT ALL ON TABLE "public"."rule_social_stands" TO "anon";
GRANT ALL ON TABLE "public"."rule_social_stands" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_social_stands" TO "service_role";



GRANT ALL ON TABLE "public"."rule_sound_cues" TO "anon";
GRANT ALL ON TABLE "public"."rule_sound_cues" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_sound_cues" TO "service_role";



GRANT ALL ON TABLE "public"."rule_spells" TO "anon";
GRANT ALL ON TABLE "public"."rule_spells" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_spells" TO "service_role";



GRANT UPDATE("cutout_path") ON TABLE "public"."rule_spells" TO "service_role";



GRANT UPDATE("illustration_wide_path") ON TABLE "public"."rule_spells" TO "service_role";



GRANT UPDATE("illustration_path") ON TABLE "public"."rule_spells" TO "service_role";



GRANT ALL ON TABLE "public"."rule_weapon_materials" TO "anon";
GRANT ALL ON TABLE "public"."rule_weapon_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_weapon_materials" TO "service_role";



GRANT ALL ON TABLE "public"."rule_weapons" TO "anon";
GRANT ALL ON TABLE "public"."rule_weapons" TO "authenticated";
GRANT ALL ON TABLE "public"."rule_weapons" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































drop extension if exists "pg_net";

drop trigger if exists "enforce_versioning_status_transition" on "storage"."buckets";


  create policy "alea_campaign_maps_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm((split_part(name, '/'::text, 1))::uuid))));



  create policy "alea_campaign_maps_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm((split_part(name, '/'::text, 1))::uuid))));



  create policy "alea_campaign_maps_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm((split_part(name, '/'::text, 1))::uuid))))
with check (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm((split_part(name, '/'::text, 1))::uuid))));



  create policy "alea_sounds_admin_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-sound-effects'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "alea_sounds_admin_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-sound-effects'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "alea_sounds_admin_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'alea-sound-effects'::text) AND ( SELECT private.is_admin() AS is_admin)))
with check (((bucket_id = 'alea-sound-effects'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "alea_sounds_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'alea-sound-effects'::text));



  create policy "aragorn_linked_material_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = ANY (ARRAY['campaign-actor-images'::text, 'campaign-location-assets'::text, 'campaign-maps'::text, 'combat-scene-maps'::text])) AND (EXISTS ( SELECT 1
   FROM public.campaign_materials m
  WHERE ((m.storage_bucket = objects.bucket_id) AND (m.storage_path = objects.name) AND ((m.campaign_id)::text = split_part(objects.name, '/'::text, 1)) AND (m.archived_at IS NULL) AND (private.is_admin() OR private.is_campaign_gm(m.campaign_id) OR (private.is_campaign_member(m.campaign_id) AND ((EXISTS ( SELECT 1
           FROM public.campaign_material_shares s
          WHERE ((s.campaign_id = m.campaign_id) AND (s.material_id = m.id) AND (s.revoked_at IS NULL)))) OR (EXISTS ( SELECT 1
           FROM public.campaign_material_presentations p
          WHERE ((p.campaign_id = m.campaign_id) AND (p.material_id = m.id))))))))))));



  create policy "arcane_gallery_history_storage_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = ANY (ARRAY['campaign-materials'::text, 'campaign-actor-images'::text, 'campaign-location-assets'::text, 'campaign-maps'::text, 'combat-scene-maps'::text, 'combat-icons'::text])) AND (EXISTS ( SELECT 1
   FROM (public.campaign_materials m
     JOIN public.campaign_material_presentation_history h ON (((h.campaign_id = m.campaign_id) AND (h.material_id = m.id))))
  WHERE ((m.storage_bucket = objects.bucket_id) AND ((m.storage_path = objects.name) OR (m.thumbnail_path = objects.name)) AND (m.asset_kind = 'image'::text) AND (m.archived_at IS NULL) AND private.is_campaign_member(m.campaign_id) AND (split_part(objects.name, '/'::text, 1) = (m.campaign_id)::text))))));



  create policy "battle_pose_staging_admin_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-battle-pose-staging'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "battle_pose_staging_admin_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-battle-pose-staging'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "battle_pose_staging_admin_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'alea-battle-pose-staging'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "battle_pose_staging_admin_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'alea-battle-pose-staging'::text) AND ( SELECT private.is_admin() AS is_admin)))
with check (((bucket_id = 'alea-battle-pose-staging'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "campaign_actor_images_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'campaign-actor-images'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm))));



  create policy "campaign_actor_images_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'campaign-actor-images'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm))));



  create policy "campaign_actor_images_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-actor-images'::text) AND ((EXISTS ( SELECT 1
   FROM public.campaign_npcs n
  WHERE ((n.image_path = objects.name) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm(n.campaign_id) AS is_campaign_gm) OR (n.player_visible AND ( SELECT private.is_campaign_member(n.campaign_id) AS is_campaign_member)))))) OR (EXISTS ( SELECT 1
   FROM public.campaign_monsters m
  WHERE ((m.image_path = objects.name) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm(m.campaign_id) AS is_campaign_gm) OR (m.player_visible AND ( SELECT private.is_campaign_member(m.campaign_id) AS is_campaign_member)))))))));



  create policy "campaign_actor_images_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'campaign-actor-images'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
with check (((bucket_id = 'campaign-actor-images'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))){withcheck_clause};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm))));
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm))))
with check (((bucket_id = 'campaign-actor-images'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm))));



  create policy "campaign_actor_images_visible_combat_portrait_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-actor-images'::text) AND (EXISTS ( SELECT 1
   FROM (public.combatants c
     JOIN public.combat_instances ci ON ((ci.id = c.combat_id)))
  WHERE (((c.state ->> 'portrait_image_path'::text) = objects.name) AND (ci.campaign_id = c.campaign_id) AND (ci.status = ANY (ARRAY['active'::text, 'paused'::text])) AND (c.status <> 'removed'::text) AND (c.visible_to_players = true) AND private.is_campaign_member(c.campaign_id))))));



  create policy "campaign_images_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-location-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_images i
  WHERE ((i.storage_bucket = objects.bucket_id) AND (i.storage_path = objects.name) AND (split_part(objects.name, '/'::text, 1) = (i.campaign_id)::text) AND (private.is_admin() OR private.is_campaign_gm(i.campaign_id) OR (private.is_campaign_member(i.campaign_id) AND (EXISTS ( SELECT 1
           FROM public.campaign_image_links l
          WHERE ((l.image_id = i.id) AND (l.campaign_id = i.campaign_id) AND l.player_visible))))))))));



  create policy "campaign_location_assets_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'campaign-location-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id)))))));



  create policy "campaign_location_assets_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'campaign-location-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id)))))));



  create policy "campaign_location_assets_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-location-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_location_assets a
  WHERE ((a.storage_path = objects.name) AND (private.is_admin() OR private.is_campaign_gm(a.campaign_id) OR (a.player_visible AND private.is_campaign_member(a.campaign_id))))))));



  create policy "campaign_location_assets_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'campaign-location-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id)))))))
with check (((bucket_id = 'campaign-location-assets'::text) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id)))))));



  create policy "campaign_maps_active_combat_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-maps'::text) AND (EXISTS ( SELECT 1
   FROM (public.campaign_maps m
     JOIN public.combat_instances ci ON (((ci.map_id = m.id) AND (ci.campaign_id = m.campaign_id) AND (ci.status = ANY (ARRAY['active'::text, 'paused'::text])))))
  WHERE ((m.image_path = objects.name) AND private.is_campaign_member(m.campaign_id))))));



  create policy "campaign_maps_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm(
CASE
    WHEN (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) THEN (split_part(name, '/'::text, 1))::uuid
    ELSE NULL::uuid
END))));



  create policy "campaign_maps_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm(
CASE
    WHEN (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) THEN (split_part(name, '/'::text, 1))::uuid
    ELSE NULL::uuid
END))));



  create policy "campaign_maps_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-maps'::text) AND (EXISTS ( SELECT 1
   FROM public.campaign_maps m
  WHERE ((split_part(objects.name, '/'::text, 1) = (m.campaign_id)::text) AND (split_part(objects.name, '/'::text, 2) = (m.id)::text) AND (private.is_admin() OR private.is_campaign_gm(m.campaign_id) OR ((m.player_visible = true) AND private.is_campaign_member(m.campaign_id))))))));



  create policy "campaign_maps_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm(
CASE
    WHEN (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
with check (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm(
CASE
    WHEN (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) THEN (split_part(name, '/'::text, 1))::uuid
    ELSE NULL::uuid
END)))){withcheck_clause};
::text) THEN (split_part(name, '/'::text, 1))::uuid
    ELSE NULL::uuid
END))));
::text) THEN (split_part(name, '/'::text, 1))::uuid
    ELSE NULL::uuid
END))))
with check (((bucket_id = 'campaign-maps'::text) AND (private.is_admin() OR private.is_campaign_gm(
CASE
    WHEN (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) THEN (split_part(name, '/'::text, 1))::uuid
    ELSE NULL::uuid
END))));



  create policy "campaign_materials_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'campaign-materials'::text) AND public.material_storage_path_valid(name) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id))))) AND (NOT (EXISTS ( SELECT 1
   FROM public.campaign_materials m
  WHERE ((m.storage_bucket = 'campaign-materials'::text) AND ((m.storage_path = objects.name) OR (m.thumbnail_path = objects.name))))))));



  create policy "campaign_materials_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'campaign-materials'::text) AND public.material_storage_path_valid(name) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id)))))));



  create policy "campaign_materials_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-materials'::text) AND public.material_storage_path_valid(name) AND (EXISTS ( SELECT 1
   FROM public.campaigns c
  WHERE (((c.id)::text = split_part(objects.name, '/'::text, 1)) AND (private.is_admin() OR private.is_campaign_gm(c.id) OR (private.is_campaign_member(c.id) AND (EXISTS ( SELECT 1
           FROM public.campaign_materials m
          WHERE ((m.campaign_id = c.id) AND (m.storage_bucket = 'campaign-materials'::text) AND (m.archived_at IS NULL) AND ((m.storage_path = objects.name) OR (m.thumbnail_path = objects.name)) AND ((EXISTS ( SELECT 1
                   FROM public.campaign_material_shares s
                  WHERE ((s.campaign_id = m.campaign_id) AND (s.material_id = m.id) AND (s.revoked_at IS NULL)))) OR (EXISTS ( SELECT 1
                   FROM public.campaign_material_presentations p
                  WHERE ((p.campaign_id = m.campaign_id) AND (p.material_id = m.id)))))))))))))));



  create policy "character_round_art_orphan_cleanup"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-character-round-backgrounds'::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE (((c.campaign_id)::text = split_part(objects.name, '/'::text, 1)) AND ((c.id)::text = split_part(objects.name, '/'::text, 2)) AND (objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp;
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm(c.campaign_id) AS is_campaign_gm) OR (c.owner_id = ( SELECT auth.uid() AS uid))) AND (NOT (EXISTS ( SELECT 1
           FROM public.characters saved
          WHERE (saved.round_background_path = objects.name)))) AND (NOT (EXISTS ( SELECT 1
           FROM public.combatants warrior
          WHERE (((warrior.state ->> 'round_background_source'::text) = 'character'::text) AND ((warrior.state ->> 'round_background_path'::text) = objects.name))))))))));



  create policy "character_round_art_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'alea-character-round-backgrounds'::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE (((c.campaign_id)::text = split_part(objects.name, '/'::text, 1)) AND ((c.id)::text = split_part(objects.name, '/'::text, 2)) AND (objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp;
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_member(c.campaign_id) AS is_campaign_member)))))));



  create policy "character_round_art_upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-character-round-backgrounds'::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE (((c.campaign_id)::text = split_part(objects.name, '/'::text, 1)) AND ((c.id)::text = split_part(objects.name, '/'::text, 2)) AND (objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp;
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm(c.campaign_id) AS is_campaign_gm) OR (c.owner_id = ( SELECT auth.uid() AS uid))))))));



  create policy "combat_icons_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'combat-icons'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))))))));



  create policy "combat_icons_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'combat-icons'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))))));



  create policy "combat_icons_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'combat-icons'::text) AND (split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_admin() AS is_admin) OR ( SELECT private.is_campaign_member((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_member))));



  create policy "combat_icons_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'combat-icons'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
with check (((bucket_id = 'combat-icons'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}{withcheck_clause};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))))))){withcheck_clause};
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}{withcheck_clause};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))))))){withcheck_clause};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))))))));
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
with check (((bucket_id = 'combat-icons'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))))))){withcheck_clause};
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid))))))))))){withcheck_clause};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))))))));
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))))))))
with check (((bucket_id = 'combat-icons'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm) OR ((split_part(name, '/'::text, 2) = 'character'::text) AND (split_part(name, '/'::text, 3) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND (EXISTS ( SELECT 1
   FROM public.characters c
  WHERE ((c.id = (split_part(c.name, '/'::text, 3))::uuid) AND (c.campaign_id = (split_part(c.name, '/'::text, 1))::uuid) AND (c.owner_id = ( SELECT auth.uid() AS uid)))))))))));



  create policy "combat_scene_maps_active_combat_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'combat-scene-maps'::text) AND (EXISTS ( SELECT 1
   FROM public.combat_instances ci
  WHERE ((ci.status = ANY (ARRAY['active'::text, 'paused'::text])) AND ((ci.settings ->> 'background_image_path'::text) = objects.name) AND ((ci.campaign_id)::text = split_part(objects.name, '/'::text, 1)) AND private.is_campaign_member(ci.campaign_id))))));



  create policy "combat_scene_maps_storage_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'combat-scene-maps'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))));



  create policy "combat_scene_maps_storage_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'combat-scene-maps'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))));



  create policy "combat_scene_maps_storage_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'combat-scene-maps'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))));



  create policy "combat_scene_maps_storage_update"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'combat-scene-maps'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}
with check (((bucket_id = 'combat-scene-maps'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm))))){withcheck_clause};
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))));
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))))
with check (((bucket_id = 'combat-scene-maps'::text) AND (( SELECT private.is_admin() AS is_admin) OR ((split_part(name, '/'::text, 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12};
::text) AND ( SELECT private.is_campaign_gm((split_part(objects.name, '/'::text, 1))::uuid) AS is_campaign_gm)))));



  create policy "equipment_art_delete_admin"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-equipment-art'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "equipment_art_delete_item_owner"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-equipment-art'::text) AND (name ~ '^item/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png);
::text) AND (split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text)));



  create policy "equipment_art_insert_admin"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-equipment-art'::text) AND ( SELECT private.is_admin() AS is_admin) AND ((name ~ '^(weapon|armor|shield|equipment)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png);
::text) OR (name ~ '^armor/(head|arms|torso|legs)/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png);
::text) OR ((name ~ '^projectile/[a-z][a-z0-9_]{1,50}/[0-9a-f-]{36}\.(webp|png);
::text) AND (EXISTS ( SELECT 1
   FROM public.rule_projectile_types p
  WHERE (p.projectile_key = split_part(objects.name, '/'::text, 2))))))));



  create policy "equipment_art_insert_item_owner"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-equipment-art'::text) AND (name ~ '^item/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|png);
::text) AND (split_part(name, '/'::text, 2) = (( SELECT auth.uid() AS uid))::text)));



  create policy "equipment_art_select_authenticated"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using ((bucket_id = 'alea-equipment-art'::text));



  create policy "global_npc_portraits_select"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'campaign-actor-images'::text) AND (EXISTS ( SELECT 1
   FROM public.global_npcs n
  WHERE ((n.image_path = objects.name) AND (( SELECT private.is_admin() AS is_admin) OR (EXISTS ( SELECT 1
           FROM public.campaigns c
          WHERE private.is_campaign_gm(c.id)))))))));



  create policy "hermes_alea_insert"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (private.hermes_alea_storage_allowed(bucket_id, name, false));



  create policy "hermes_alea_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (private.hermes_alea_storage_allowed(bucket_id, name, true));



  create policy "hermes_vfx_admin_delete"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-combat-animations'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "hermes_vfx_admin_upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-combat-animations'::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "hermes_vfx_read"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'alea-combat-animations'::text));



  create policy "hit_figure_storage_admin_cleanup"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-hit-figures'::text) AND (name ~ '^figure/[0-9a-f-]{36}\.webp;
::text) AND ( SELECT private.is_admin() AS is_admin) AND (NOT (EXISTS ( SELECT 1
   FROM public.rule_hit_figure_images i
  WHERE (i.image_path = objects.name))))));



  create policy "hit_figure_storage_admin_upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-hit-figures'::text) AND (name ~ '^figure/[0-9a-f-]{36}\.webp;
::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "hit_figure_storage_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'alea-hit-figures'::text) AND (name ~ '^figure/[0-9a-f-]{36}\.webp;
::text)));



  create policy "round_background_storage_admin_cleanup"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'alea-round-backgrounds'::text) AND (name ~ '^round/[0-9a-f-]{36}\.(webp|png|jpg|jpeg);
::text) AND ( SELECT private.is_admin() AS is_admin) AND (NOT (EXISTS ( SELECT 1
   FROM public.rule_combat_round_backgrounds r
  WHERE (r.image_path = objects.name))))));



  create policy "round_background_storage_admin_upload"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-round-backgrounds'::text) AND (name ~ '^round/[0-9a-f-]{36}\.(webp|png|jpg|jpeg);
::text) AND ( SELECT private.is_admin() AS is_admin)));



  create policy "round_background_storage_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'alea-round-backgrounds'::text) AND (name ~ '^round/[0-9a-f-]{36}\.(webp|png|jpg|jpeg);
::text)));



  create policy "skill_art_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'alea-skill-art'::text) AND (name ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/(icon|illustration|illustration_wide)/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg);
::text) AND (EXISTS ( SELECT 1
   FROM public.rule_skills sk
  WHERE (sk.id = split_part(objects.name, '/'::text, 2))))));



  create policy "skill_art_upload_admin"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-skill-art'::text) AND ( SELECT private.is_admin() AS is_admin) AND (name ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/(icon|illustration|illustration_wide)/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg);
::text) AND (NOT ((split_part(name, '/'::text, 3) = 'icon'::text) AND (name ~ '[.]jpg;
::text))) AND (EXISTS ( SELECT 1
   FROM public.rule_skills sk
  WHERE (sk.id = split_part(objects.name, '/'::text, 2))))));



  create policy "spell_art_read"
  on "storage"."objects"
  as permissive
  for select
  to authenticated
using (((bucket_id = 'alea-spell-art'::text) AND (name ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp;
::text)));



  create policy "spell_art_upload_admin"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check (((bucket_id = 'alea-spell-art'::text) AND ( SELECT private.is_admin() AS is_admin) AND (name ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp;
::text) AND (EXISTS ( SELECT 1
   FROM public.rule_spells s
  WHERE ((s.id)::text = split_part(objects.name, '/'::text, 2))))));



