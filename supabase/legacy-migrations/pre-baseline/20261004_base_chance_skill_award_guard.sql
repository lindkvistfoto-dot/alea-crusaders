create or replace function public.award_character_erf(
  p_character_id uuid,
  p_item_group text,
  p_item_key text,
  p_amount integer,
  p_reason text
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
  v_rule_name text;
  v_rule_bc text;
begin
  if p_item_group not in ('skills','baseChanceSkills','weapons','shields','spells') then raise exception 'Ogiltig ERF-grupp.'; end if;
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
    select 1 from public.character_erf_awards a
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

    select name,bc into v_rule_name,v_rule_bc from public.rule_skills where id=p_item_key::uuid;
    if not found or coalesce(trim(v_rule_bc),'') in ('','0','—','NONE') then
      raise exception 'Färdigheten har ingen baschans.';
    end if;

    select e.value,(e.ordinality-1)::integer into v_item,v_index
    from jsonb_array_elements(coalesce(v_character.data->'baseChanceSkills','[]'::jsonb))
         with ordinality as e(value,ordinality)
    where e.value->>'skillId'=p_item_key limit 1;

    if v_index is null then
      v_character.data:=jsonb_set(
        v_character.data,'{baseChanceSkills}',
        coalesce(v_character.data->'baseChanceSkills','[]'::jsonb)
          || jsonb_build_array(jsonb_build_object('skillId',p_item_key,'name',v_rule_name,'erf',0)),true
      );
      update public.characters set data=v_character.data,updated_at=now() where id=v_character.id;

      select e.value,(e.ordinality-1)::integer into v_item,v_index
      from jsonb_array_elements(coalesce(v_character.data->'baseChanceSkills','[]'::jsonb))
           with ordinality as e(value,ordinality)
      where e.value->>'skillId'=p_item_key limit 1;
    end if;
  else
    select e.value,(e.ordinality-1)::integer into v_item,v_index
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
  set data=jsonb_set(data,array[p_item_group,v_index::text,'erf'],to_jsonb(v_new_erf),true),updated_at=now()
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
