create table if not exists public.campaign_day_state (
  campaign_id uuid primary key references public.campaigns(id) on delete cascade,
  day_number integer not null default 1 check (day_number >= 1),
  weather text not null default '',
  with_rest boolean not null default true,
  erf_cycle integer not null default 1 check (erf_cycle >= 1),
  erf_enabled boolean not null default true,
  started_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.campaign_day_history (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  day_number integer not null check (day_number >= 1),
  weather text not null default '',
  with_rest boolean not null default true,
  erf_cycle integer not null check (erf_cycle >= 1),
  started_at timestamptz not null default now(),
  started_by uuid references auth.users(id) on delete set null,
  unique (campaign_id, day_number)
);

create table if not exists public.character_erf_awards (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  character_id uuid not null references public.characters(id) on delete cascade,
  item_group text not null check (item_group in ('skills','weapons','shields','spells')),
  item_key text not null,
  day_number integer not null check (day_number >= 1),
  erf_cycle integer not null check (erf_cycle >= 1),
  awarded_by uuid references auth.users(id) on delete set null,
  awarded_at timestamptz not null default now(),
  unique (campaign_id, character_id, item_group, item_key, erf_cycle)
);

create index if not exists character_erf_awards_character_idx
  on public.character_erf_awards (character_id, erf_cycle);

alter table public.campaign_day_state enable row level security;
alter table public.campaign_day_history enable row level security;
alter table public.character_erf_awards enable row level security;

drop policy if exists campaign_day_state_select on public.campaign_day_state;
create policy campaign_day_state_select on public.campaign_day_state
for select to authenticated using ((select private.is_campaign_member(campaign_id)));

drop policy if exists campaign_day_history_select on public.campaign_day_history;
create policy campaign_day_history_select on public.campaign_day_history
for select to authenticated using ((select private.is_campaign_member(campaign_id)));

drop policy if exists character_erf_awards_select on public.character_erf_awards;
create policy character_erf_awards_select on public.character_erf_awards
for select to authenticated
using (
  (select private.is_admin())
  or (select private.is_campaign_gm(campaign_id))
  or exists (
    select 1 from public.characters c
    where c.id = character_id
      and c.owner_id = (select auth.uid())
  )
);

grant select on public.campaign_day_state to authenticated;
grant select on public.campaign_day_history to authenticated;
grant select on public.character_erf_awards to authenticated;

insert into public.campaign_day_state
(campaign_id,day_number,weather,with_rest,erf_cycle,erf_enabled,started_at,updated_at)
select id,1,'',true,1,true,now(),now() from public.campaigns
on conflict (campaign_id) do nothing;

insert into public.campaign_day_history
(campaign_id,day_number,weather,with_rest,erf_cycle,started_at)
select campaign_id,day_number,weather,with_rest,erf_cycle,started_at
from public.campaign_day_state
on conflict (campaign_id,day_number) do nothing;

create or replace function public.init_campaign_day_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.campaign_day_state
  (campaign_id,day_number,weather,with_rest,erf_cycle,erf_enabled,started_at,updated_at)
  values (new.id,1,'',true,1,true,now(),now())
  on conflict (campaign_id) do nothing;

  insert into public.campaign_day_history
  (campaign_id,day_number,weather,with_rest,erf_cycle,started_at)
  values (new.id,1,'',true,1,now())
  on conflict (campaign_id,day_number) do nothing;
  return new;
end
$$;

drop trigger if exists campaigns_init_day_state on public.campaigns;
create trigger campaigns_init_day_state
after insert on public.campaigns
for each row execute function public.init_campaign_day_state();

create or replace function public.advance_campaign_day(p_campaign_id uuid,p_weather text,p_with_rest boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.campaign_day_state%rowtype;
  v_new_day integer;
  v_new_cycle integer;
  v_weather text := coalesce(trim(p_weather),'');
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att starta en ny dag.';
  end if;

  select * into v_state
  from public.campaign_day_state
  where campaign_id=p_campaign_id
  for update;

  if not found then
    insert into public.campaign_day_state
    (campaign_id,day_number,weather,with_rest,erf_cycle,erf_enabled,started_at,updated_by,updated_at)
    values (p_campaign_id,1,'',true,1,true,now(),auth.uid(),now())
    returning * into v_state;
  end if;

  v_new_day:=v_state.day_number+1;
  v_new_cycle:=v_state.erf_cycle+case when coalesce(p_with_rest,false) then 1 else 0 end;

  update public.campaign_day_state
  set day_number=v_new_day,
      weather=v_weather,
      with_rest=coalesce(p_with_rest,false),
      erf_cycle=v_new_cycle,
      erf_enabled=coalesce(p_with_rest,false),
      started_at=now(),
      updated_by=auth.uid(),
      updated_at=now()
  where campaign_id=p_campaign_id
  returning * into v_state;

  insert into public.campaign_day_history
  (campaign_id,day_number,weather,with_rest,erf_cycle,started_at,started_by)
  values (p_campaign_id,v_state.day_number,v_state.weather,v_state.with_rest,v_state.erf_cycle,v_state.started_at,auth.uid())
  on conflict (campaign_id,day_number) do update set
    weather=excluded.weather,
    with_rest=excluded.with_rest,
    erf_cycle=excluded.erf_cycle,
    started_at=excluded.started_at,
    started_by=excluded.started_by;

  return to_jsonb(v_state);
end
$$;

create or replace function public.set_campaign_weather(p_campaign_id uuid,p_weather text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.campaign_day_state%rowtype;
  v_weather text := coalesce(trim(p_weather),'');
begin
  if not (private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Du har inte behörighet att ändra vädret.';
  end if;

  update public.campaign_day_state
  set weather=v_weather,updated_by=auth.uid(),updated_at=now()
  where campaign_id=p_campaign_id
  returning * into v_state;

  if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;

  update public.campaign_day_history
  set weather=v_weather
  where campaign_id=p_campaign_id and day_number=v_state.day_number;

  return to_jsonb(v_state);
end
$$;

create or replace function public.award_character_erf(p_character_id uuid,p_item_group text,p_item_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_character public.characters%rowtype;
  v_state public.campaign_day_state%rowtype;
  v_item jsonb;
  v_index integer;
  v_current_erf integer;
  v_new_erf integer;
  v_inserted uuid;
begin
  if p_item_group not in ('skills','weapons','shields','spells') then raise exception 'Ogiltig ERF-grupp.'; end if;
  if coalesce(trim(p_item_key),'')='' then raise exception 'Färdigheten saknar en stabil identifierare.'; end if;

  select * into v_character from public.characters where id=p_character_id for update;
  if not found then raise exception 'Rollpersonen finns inte.'; end if;

  if not (private.is_admin() or private.is_campaign_gm(v_character.campaign_id) or v_character.owner_id=auth.uid()) then
    raise exception 'Du har inte behörighet att ändra ERF för rollpersonen.';
  end if;

  select * into v_state from public.campaign_day_state where campaign_id=v_character.campaign_id;
  if not found then raise exception 'Kampanjens dagstatus saknas.'; end if;
  if not v_state.erf_enabled then raise exception 'ERF kan inte tjänas denna dag. Starta en ny dag med vila.'; end if;

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

  if v_index is null then raise exception 'Färdigheten kunde inte hittas på rollpersonen.'; end if;

  insert into public.character_erf_awards
  (campaign_id,character_id,item_group,item_key,day_number,erf_cycle,awarded_by)
  values (v_character.campaign_id,v_character.id,p_item_group,p_item_key,v_state.day_number,v_state.erf_cycle,auth.uid())
  on conflict (campaign_id,character_id,item_group,item_key,erf_cycle) do nothing
  returning id into v_inserted;

  if v_inserted is null then
    raise exception 'Den här färdigheten har redan tjänat 1 ERF under den aktuella viloperioden.';
  end if;

  v_current_erf:=coalesce(nullif(v_item->>'erf','')::integer,0);
  v_new_erf:=v_current_erf+1;

  update public.characters
  set data=jsonb_set(data,array[p_item_group,v_index::text,'erf'],to_jsonb(v_new_erf),true),
      updated_at=now()
  where id=v_character.id;

  return jsonb_build_object('new_erf',v_new_erf,'day_number',v_state.day_number,'erf_cycle',v_state.erf_cycle,'item_group',p_item_group,'item_key',p_item_key);
end
$$;

revoke all on function public.advance_campaign_day(uuid,text,boolean) from public;
revoke all on function public.set_campaign_weather(uuid,text) from public;
revoke all on function public.award_character_erf(uuid,text,text) from public;
grant execute on function public.advance_campaign_day(uuid,text,boolean) to authenticated;
grant execute on function public.set_campaign_weather(uuid,text) to authenticated;
grant execute on function public.award_character_erf(uuid,text,text) to authenticated;
