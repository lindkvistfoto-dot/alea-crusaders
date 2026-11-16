create or replace function public.advance_campaign_day(
  p_campaign_id uuid,
  p_weather text,
  p_rest_hours numeric
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
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
$function$;
