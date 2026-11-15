-- ARCANE Spelmöte: persist play sessions and expose the existing campaign clock
-- through the intended five independent day phases.

create table if not exists public.game_sessions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null default 'Spelmöte',
  adventure_name text,
  session_date date not null default current_date,
  status text not null default 'active' check (status in ('active','paused','closed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  summary text,
  started_by uuid references auth.users(id) on delete set null,
  ended_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id,campaign_id),
  check ((status='closed' and ended_at is not null) or status<>'closed')
);
create unique index if not exists game_sessions_one_active_per_campaign
  on public.game_sessions(campaign_id) where status in ('active','paused');
create index if not exists game_sessions_campaign_history_idx
  on public.game_sessions(campaign_id,started_at desc);

create table if not exists public.game_session_participants (
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_id uuid not null,
  character_id uuid not null,
  character_name_snapshot text not null,
  participant_kind text not null default 'player' check (participant_kind in ('player','gm')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (session_id,character_id),
  foreign key (session_id,campaign_id) references public.game_sessions(id,campaign_id) on delete cascade,
  foreign key (character_id,campaign_id) references public.characters(id,campaign_id) on delete cascade
);
create index if not exists game_session_participants_campaign_idx
  on public.game_session_participants(campaign_id,session_id);

alter table public.game_sessions enable row level security;
alter table public.game_session_participants enable row level security;
grant select,insert,update on public.game_sessions to authenticated;
grant select,insert,update,delete on public.game_session_participants to authenticated;
grant all on public.game_sessions,public.game_session_participants to service_role;

create policy game_sessions_member_read on public.game_sessions for select to authenticated
  using (private.is_campaign_member(campaign_id) or private.is_campaign_gm(campaign_id) or private.is_admin());
create policy game_sessions_gm_insert on public.game_sessions for insert to authenticated
  with check (private.is_campaign_gm(campaign_id) or private.is_admin());
create policy game_sessions_gm_update on public.game_sessions for update to authenticated
  using (private.is_campaign_gm(campaign_id) or private.is_admin())
  with check (private.is_campaign_gm(campaign_id) or private.is_admin());
create policy game_session_participants_member_read on public.game_session_participants for select to authenticated
  using (private.is_campaign_member(campaign_id) or private.is_campaign_gm(campaign_id) or private.is_admin());
create policy game_session_participants_gm_insert on public.game_session_participants for insert to authenticated
  with check (private.is_campaign_gm(campaign_id) or private.is_admin());
create policy game_session_participants_gm_update on public.game_session_participants for update to authenticated
  using (private.is_campaign_gm(campaign_id) or private.is_admin())
  with check (private.is_campaign_gm(campaign_id) or private.is_admin());
create policy game_session_participants_gm_delete on public.game_session_participants for delete to authenticated
  using (private.is_campaign_gm(campaign_id) or private.is_admin());

-- Keep the existing campaign_day_state as the only current-state record.
update public.campaign_day_state set time_of_day='afternoon' where time_of_day='midday';
alter table public.campaign_day_state drop constraint if exists campaign_day_state_time_of_day_check;
alter table public.campaign_day_state add constraint campaign_day_state_time_of_day_check
  check (time_of_day = any (array['dawn','morning','afternoon','evening','night']::text[]));

create or replace function public.set_campaign_time_of_day(p_campaign_id uuid,p_time_of_day text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state public.campaign_day_state%rowtype;
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att ändra dygnsfasen.';
  end if;
  if p_time_of_day is null or p_time_of_day not in ('dawn','morning','afternoon','evening','night') then
    raise exception 'Ogiltig dygnsfas.';
  end if;
  update public.campaign_day_state set time_of_day=p_time_of_day,updated_by=auth.uid(),updated_at=now()
   where campaign_id=p_campaign_id returning * into v_state;
  if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;
  return to_jsonb(v_state);
end $$;
revoke all on function public.set_campaign_time_of_day(uuid,text) from public,anon;
grant execute on function public.set_campaign_time_of_day(uuid,text) to authenticated,service_role;

create or replace function public.set_campaign_day_number(p_campaign_id uuid,p_day_number integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_state public.campaign_day_state%rowtype;
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att ändra kampanjdagen.';
  end if;
  if p_day_number is null or p_day_number < 1 then raise exception 'Dagnumret måste vara minst 1.'; end if;
  update public.campaign_day_state set day_number=p_day_number,updated_by=auth.uid(),updated_at=now()
   where campaign_id=p_campaign_id returning * into v_state;
  if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;
  insert into public.campaign_day_history(campaign_id,day_number,weather,with_rest,rest_hours,erf_cycle,started_at,started_by)
  values(v_state.campaign_id,v_state.day_number,v_state.weather,v_state.with_rest,v_state.rest_hours,v_state.erf_cycle,v_state.started_at,auth.uid())
  on conflict(campaign_id,day_number) do nothing;
  return to_jsonb(v_state);
end $$;
revoke all on function public.set_campaign_day_number(uuid,integer) from public,anon;
grant execute on function public.set_campaign_day_number(uuid,integer) to authenticated,service_role;

-- Separate explicit rest action, using the established PSY and ERF thresholds.
create or replace function public.apply_campaign_rest(p_campaign_id uuid,p_rest_hours numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_state public.campaign_day_state%rowtype;
  v_hours numeric(5,2):=greatest(coalesce(p_rest_hours,0),0);
  v_old_hours numeric(5,2);
  v_total_hours numeric(5,2);
  v_full_hours integer:=floor(greatest(coalesce(p_rest_hours,0),0));
  v_char record;
  v_rest public.character_rest_state%rowtype;
  v_threshold numeric(5,2);
  v_char_total numeric(5,2);
  v_psy integer; v_psy_max integer;
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att registrera vila.';
  end if;
  if v_hours<=0 or v_hours>24 then raise exception 'Vilotiden måste vara mellan 0 och 24 timmar.'; end if;
  select * into v_state from public.campaign_day_state where campaign_id=p_campaign_id for update;
  if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;
  v_old_hours:=case when v_state.with_rest then v_state.rest_hours else 0 end;
  v_total_hours:=v_old_hours+v_hours;
  update public.campaign_day_state set with_rest=true,rest_hours=v_total_hours,
    erf_cycle=erf_cycle+case when v_old_hours<6 and v_total_hours>=6 then 1 else 0 end,
    erf_enabled=(v_total_hours>=6),updated_by=auth.uid(),updated_at=now()
   where campaign_id=p_campaign_id returning * into v_state;
  insert into public.campaign_day_history(campaign_id,day_number,weather,with_rest,rest_hours,erf_cycle,started_at,started_by)
  values(v_state.campaign_id,v_state.day_number,v_state.weather,true,v_state.rest_hours,v_state.erf_cycle,v_state.started_at,auth.uid())
  on conflict(campaign_id,day_number) do update set weather=excluded.weather,with_rest=true,
    rest_hours=excluded.rest_hours,erf_cycle=excluded.erf_cycle;
  for v_char in select c.id,c.data from public.characters c where c.campaign_id=p_campaign_id for update loop
    v_threshold:=case when exists(select 1 from public.rule_races rr
      where lower(trim(rr.name))=lower(trim(coalesce(v_char.data->'identity'->>'ras','')))
        and rr.category='Älvfolk') then 2 else 6 end;
    insert into public.character_rest_state(character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
    values(v_char.id,p_campaign_id,coalesce(v_state.erf_cycle,1),v_state.day_number,0,v_state.day_number,now())
    on conflict(character_id) do nothing;
    select * into v_rest from public.character_rest_state where character_id=v_char.id for update;
    v_char_total:=case when v_rest.last_day_number=v_state.day_number then v_rest.last_rest_hours else 0 end+v_hours;
    update public.character_rest_state set erf_cycle=case
        when v_rest.last_day_number=v_state.day_number and v_rest.last_rest_hours<v_threshold and v_char_total>=v_threshold then v_rest.erf_cycle+1
        when v_rest.last_day_number<>v_state.day_number and v_char_total>=v_threshold then v_rest.erf_cycle+1
        else v_rest.erf_cycle end,
      last_erf_reset_day=case when v_char_total>=v_threshold and
        (v_rest.last_day_number<>v_state.day_number or v_rest.last_rest_hours<v_threshold)
        then v_state.day_number else v_rest.last_erf_reset_day end,
      last_day_number=v_state.day_number,last_rest_hours=v_char_total,updated_at=now()
    where character_id=v_char.id;
    if v_full_hours>0 then
      v_psy:=coalesce(nullif(v_char.data->'live'->>'PSY','')::integer,0);
      v_psy_max:=coalesce(nullif(v_char.data->'live'->>'PSYmax','')::integer,
        nullif(v_char.data->'base'->'Psykisk kraft'->>'v','')::integer,v_psy);
      update public.characters set data=jsonb_set(data,'{live}',coalesce(data->'live','{}'::jsonb)||
        jsonb_build_object('PSY',least(v_psy_max,v_psy+v_full_hours)),true),updated_at=now() where id=v_char.id;
    end if;
  end loop;
  return to_jsonb(v_state);
end $$;
revoke all on function public.apply_campaign_rest(uuid,numeric) from public,anon;
grant execute on function public.apply_campaign_rest(uuid,numeric) to authenticated,service_role;
