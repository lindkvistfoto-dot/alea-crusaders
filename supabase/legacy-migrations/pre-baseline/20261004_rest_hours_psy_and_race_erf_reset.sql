alter table public.campaign_day_state
  add column if not exists rest_hours numeric(5,2) not null default 0 check (rest_hours >= 0);

alter table public.campaign_day_history
  add column if not exists rest_hours numeric(5,2) not null default 0 check (rest_hours >= 0);

create table if not exists public.character_rest_state (
  character_id uuid primary key references public.characters(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  erf_cycle integer not null default 1 check (erf_cycle >= 1),
  last_day_number integer not null default 1 check (last_day_number >= 1),
  last_rest_hours numeric(5,2) not null default 0 check (last_rest_hours >= 0),
  last_erf_reset_day integer not null default 1 check (last_erf_reset_day >= 1),
  updated_at timestamptz not null default now()
);

create index if not exists character_rest_state_campaign_idx
  on public.character_rest_state (campaign_id);

alter table public.character_rest_state enable row level security;

drop policy if exists character_rest_state_select on public.character_rest_state;
create policy character_rest_state_select on public.character_rest_state
for select to authenticated
using (
  (select private.is_admin())
  or (select private.is_campaign_gm(campaign_id))
  or exists (
    select 1 from public.characters c
    where c.id=character_id and c.owner_id=(select auth.uid())
  )
);

grant select on public.character_rest_state to authenticated;

insert into public.character_rest_state
(character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
select c.id,c.campaign_id,coalesce(ds.erf_cycle,1),coalesce(ds.day_number,1),coalesce(ds.rest_hours,0),coalesce(ds.day_number,1),now()
from public.characters c
left join public.campaign_day_state ds on ds.campaign_id=c.campaign_id
on conflict (character_id) do nothing;

create or replace function public.init_character_rest_state()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_day integer; v_cycle integer; v_rest numeric(5,2);
begin
  select day_number,erf_cycle,rest_hours into v_day,v_cycle,v_rest
  from public.campaign_day_state where campaign_id=new.campaign_id;

  insert into public.character_rest_state
  (character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
  values (new.id,new.campaign_id,coalesce(v_cycle,1),coalesce(v_day,1),coalesce(v_rest,0),coalesce(v_day,1),now())
  on conflict (character_id) do nothing;
  return new;
end
$$;

drop trigger if exists characters_init_rest_state on public.characters;
create trigger characters_init_rest_state
after insert on public.characters
for each row execute function public.init_character_rest_state();

revoke all on function public.init_character_rest_state() from public;
revoke all on function public.init_character_rest_state() from anon;
revoke all on function public.init_character_rest_state() from authenticated;

drop function if exists public.advance_campaign_day(uuid,text,boolean);

create or replace function public.advance_campaign_day(p_campaign_id uuid,p_weather text,p_rest_hours numeric)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_state public.campaign_day_state%rowtype;
  v_new_day integer;
  v_new_cycle integer;
  v_weather text:=coalesce(trim(p_weather),'');
  v_rest numeric(5,2):=greatest(coalesce(p_rest_hours,0),0);
  v_full_hours integer:=floor(greatest(coalesce(p_rest_hours,0),0));
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

  select * into v_state
  from public.campaign_day_state
  where campaign_id=p_campaign_id
  for update;

  if not found then
    insert into public.campaign_day_state
    (campaign_id,day_number,weather,with_rest,rest_hours,erf_cycle,erf_enabled,started_at,updated_by,updated_at)
    values (p_campaign_id,1,'',true,0,1,true,now(),auth.uid(),now())
    returning * into v_state;
  end if;

  v_new_day:=v_state.day_number+1;
  v_new_cycle:=v_state.erf_cycle+case when v_rest>=6 then 1 else 0 end;

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
  values (p_campaign_id,v_state.day_number,v_state.weather,v_state.with_rest,v_state.rest_hours,v_state.erf_cycle,v_state.started_at,auth.uid())
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
    v_threshold:=case
      when lower(trim(coalesce(v_char.data->'identity'->>'ras',''))) like 'alv%' then 2
      else 6
    end;

    insert into public.character_rest_state
    (character_id,campaign_id,erf_cycle,last_day_number,last_rest_hours,last_erf_reset_day,updated_at)
    values (v_char.id,p_campaign_id,coalesce(v_state.erf_cycle,1),v_new_day,v_rest,v_new_day,now())
    on conflict (character_id) do nothing;

    select erf_cycle into v_char_cycle
    from public.character_rest_state
    where character_id=v_char.id
    for update;

    if v_rest>=v_threshold then
      v_char_cycle:=v_char_cycle+1;
      update public.character_rest_state
      set erf_cycle=v_char_cycle,last_erf_reset_day=v_new_day,last_day_number=v_new_day,last_rest_hours=v_rest,updated_at=now()
      where character_id=v_char.id;
    else
      update public.character_rest_state
      set last_day_number=v_new_day,last_rest_hours=v_rest,updated_at=now()
      where character_id=v_char.id;
    end if;

    if v_full_hours>0 then
      v_psy:=coalesce(nullif(v_char.data->'live'->>'PSY','')::integer,0);
      v_psy_max:=coalesce(
        nullif(v_char.data->'live'->>'PSYmax','')::integer,
        nullif(v_char.data->'base'->'Psykisk kraft'->>'v','')::integer,
        v_psy
      );
      v_new_psy:=least(v_psy_max,v_psy+v_full_hours);

      update public.characters
      set data=jsonb_set(
            data,
            '{live}',
            coalesce(data->'live','{}'::jsonb)||jsonb_build_object('PSY',v_new_psy),
            true
          ),
          updated_at=now()
      where id=v_char.id;
    end if;
  end loop;

  return to_jsonb(v_state);
end
$$;

revoke all on function public.advance_campaign_day(uuid,text,numeric) from public;
revoke all on function public.advance_campaign_day(uuid,text,numeric) from anon;
grant execute on function public.advance_campaign_day(uuid,text,numeric) to authenticated;

create or replace function public.award_character_erf(
  p_character_id uuid,p_item_group text,p_item_key text,p_amount integer,p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_character public.characters%rowtype;
  v_day public.campaign_day_state%rowtype;
  v_rest public.character_rest_state%rowtype;
  v_item jsonb;
  v_index integer;
  v_current_erf integer;
  v_new_erf integer;
  v_inserted uuid;
begin
  if p_item_group not in ('skills','weapons','shields','spells') then raise exception 'Ogiltig ERF-grupp.'; end if;
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
$$;

revoke all on function public.award_character_erf(uuid,text,text,integer,text) from public;
revoke all on function public.award_character_erf(uuid,text,text,integer,text) from anon;
grant execute on function public.award_character_erf(uuid,text,text,integer,text) to authenticated;
