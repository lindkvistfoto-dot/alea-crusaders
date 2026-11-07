-- Durable OLYMPIA alert register and guarded HERMES ALEA cleanup reporting.
create table if not exists public.olympia_system_alerts (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique check (char_length(alert_key) between 1 and 200),
  environment text not null check (environment in ('DEV','LIVE')),
  system text not null check (char_length(system) between 1 and 120),
  component text not null check (char_length(component) between 1 and 120),
  severity text not null check (severity in ('warning','critical')),
  error_code text not null check (char_length(error_code) between 1 and 120),
  description text not null check (char_length(description) between 1 and 4000),
  affected jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  recommended_action text not null default '' check (char_length(recommended_action) <= 2000),
  status text not null default 'active' check (status in ('active','acknowledged','resolved')),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id),
  resolved_at timestamptz,
  history jsonb not null default '[]'::jsonb check (jsonb_typeof(history)='array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists olympia_system_alerts_open_idx
  on public.olympia_system_alerts(environment,status,severity,occurred_at desc);
alter table public.olympia_system_alerts enable row level security;
revoke all on public.olympia_system_alerts from anon, authenticated;
grant all on public.olympia_system_alerts to service_role;

create table if not exists public.olympia_system_health (
  environment text not null check (environment in ('DEV','LIVE')),
  system text not null,
  component text not null,
  status text not null check (status in ('success','failure')),
  last_started_at timestamptz not null default now(),
  last_finished_at timestamptz not null default now(),
  last_success_at timestamptz,
  error_code text,
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(environment,system,component)
);
alter table public.olympia_system_health enable row level security;
revoke all on public.olympia_system_health from anon, authenticated;
grant all on public.olympia_system_health to service_role;

create or replace function public.olympia_system_alert_upsert(payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare result public.olympia_system_alerts;
begin
  if payload->>'environment' not in ('DEV','LIVE')
     or payload->>'severity' not in ('warning','critical')
     or coalesce(payload->>'alert_key','')=''
     or coalesce(payload->>'error_code','')='' then
    raise exception 'ALERT_INPUT_INVALID';
  end if;
  insert into public.olympia_system_alerts as existing
    (alert_key,environment,system,component,severity,error_code,description,affected,
     recommended_action,status,occurred_at,last_checked_at,history)
  values
    (payload->>'alert_key',payload->>'environment',payload->>'system',payload->>'component',
     payload->>'severity',payload->>'error_code',payload->>'description',
     coalesce(payload->'affected','{}'::jsonb),coalesce(payload->>'recommended_action',''),
     'active',now(),now(),
     jsonb_build_array(jsonb_build_object('event','opened','at',now(),'code',payload->>'error_code')))
  on conflict(alert_key) do update set
    environment=excluded.environment,system=excluded.system,component=excluded.component,
    severity=excluded.severity,error_code=excluded.error_code,description=excluded.description,
    affected=excluded.affected,recommended_action=excluded.recommended_action,
    status=case when existing.status='resolved' then 'active' else existing.status end,
    occurred_at=case when existing.status='resolved' then now() else existing.occurred_at end,
    resolved_at=case when existing.status='resolved' then null else existing.resolved_at end,
    acknowledged_at=case when existing.status='resolved' then null else existing.acknowledged_at end,
    acknowledged_by=case when existing.status='resolved' then null else existing.acknowledged_by end,
    history=case when existing.status='resolved'
      then existing.history||jsonb_build_array(jsonb_build_object('event','reopened','at',now(),'code',excluded.error_code))
      else existing.history end,
    last_checked_at=now(),updated_at=now()
  returning * into result;
  return to_jsonb(result);
end
$function$;
revoke all on function public.olympia_system_alert_upsert(jsonb) from public,anon,authenticated;
grant execute on function public.olympia_system_alert_upsert(jsonb) to service_role;

create or replace function public.olympia_system_alert_resolve(alert_key text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare result public.olympia_system_alerts;
begin
  update public.olympia_system_alerts a set status='resolved',resolved_at=now(),
    last_checked_at=now(),updated_at=now(),
    history=a.history||jsonb_build_array(jsonb_build_object('event','resolved','at',now()))
  where a.alert_key=$1 and a.status<>'resolved'
  returning * into result;
  if not found then return '{}'::jsonb; end if;
  return to_jsonb(result);
end
$function$;
revoke all on function public.olympia_system_alert_resolve(text) from public,anon,authenticated;
grant execute on function public.olympia_system_alert_resolve(text) to service_role;

create or replace function public.olympia_system_heartbeat(payload jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare result public.olympia_system_health;
begin
  if payload->>'environment' not in ('DEV','LIVE')
     or payload->>'system' is null or payload->>'component' is null
     or payload->>'status' not in ('success','failure') then
    raise exception 'HEARTBEAT_INPUT_INVALID';
  end if;
  insert into public.olympia_system_health as existing
    (environment,system,component,status,last_started_at,last_finished_at,last_success_at,error_code,summary,updated_at)
  values
    (payload->>'environment',payload->>'system',payload->>'component',payload->>'status',
     now(),now(),case when payload->>'status'='success' then now() end,
     payload->>'error_code',coalesce(payload->'summary','{}'::jsonb),now())
  on conflict(environment,system,component) do update set
    status=excluded.status,last_started_at=now(),last_finished_at=now(),
    last_success_at=case when excluded.status='success' then now() else existing.last_success_at end,
    error_code=excluded.error_code,summary=excluded.summary,updated_at=now()
  returning * into result;
  return to_jsonb(result);
end
$function$;
revoke all on function public.olympia_system_heartbeat(jsonb) from public,anon,authenticated;
grant execute on function public.olympia_system_heartbeat(jsonb) to service_role;

-- Only a caller already authorized to manage this target may raise a quota alert.
-- The database report supplies candidate job IDs; caller-provided IDs are ignored.
create or replace function public.hermes_alea_report_staging_block(request jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare
  env text:=request->>'environment';
  kind text:=request->>'target_kind';
  target uuid:=(request->>'target_id')::uuid;
  row record;
  count_created integer:=0;
  result jsonb:='[]'::jsonb;
begin
  if env not in ('DEV','LIVE') then raise exception 'ALERT_ENVIRONMENT_INVALID'; end if;
  if not private.hermes_alea_can_manage(kind,target) then raise exception 'FORBIDDEN' using errcode='42501'; end if;
  for row in select r.id,r.source_path,r.output_path from public.hermes_alea_cleanup_report r
    where r.abandoned_candidate
  loop
    result:=result||jsonb_build_array(public.olympia_system_alert_upsert(jsonb_build_object(
      'alert_key','hermes-alea:'||lower(env)||':abandoned:'||row.id,
      'environment',env,'system','HERMES ALEA','component','staging quota',
      'severity','critical','error_code','STAGING_QUOTA_EXCEEDED',
      'description','En kvarstående övergiven uppladdning blockerar stagingkvoten.',
      'affected',jsonb_build_object('job_id',row.id,'source_path',row.source_path,'output_path',row.output_path),
      'recommended_action','Kontrollera att jobbet saknar aktiv lease och bildreferens. Kör cleanup igen från schemalagd HERMES ALEA-process.')));
    count_created:=count_created+1;
  end loop;
  return jsonb_build_object('created',count_created,'alerts',result);
end
$function$;
revoke all on function public.hermes_alea_report_staging_block(jsonb) from public,anon;
grant execute on function public.hermes_alea_report_staging_block(jsonb) to authenticated;
