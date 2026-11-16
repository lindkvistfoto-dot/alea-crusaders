alter table public.character_erf_awards
  add column if not exists amount integer not null default 1 check (amount between 1 and 4),
  add column if not exists reason text not null default 'success'
    check (reason in ('success','special','perfect','manual'));

revoke all on function public.award_character_erf(uuid,text,text) from public;
revoke all on function public.award_character_erf(uuid,text,text) from anon;
revoke all on function public.award_character_erf(uuid,text,text) from authenticated;
drop function if exists public.award_character_erf(uuid,text,text);

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
  if p_amount is null or p_amount<1 or p_amount>4 then raise exception 'Ogiltigt antal ERF.'; end if;
  if p_reason not in ('success','special','perfect','manual') then raise exception 'Ogiltig ERF-orsak.'; end if;
  if p_reason in ('success','special') and p_amount<>1 then raise exception 'Lyckat eller särskilt slag ger 1 ERF.'; end if;
  if p_reason='perfect' and p_amount not between 2 and 4 then raise exception 'Perfekt slag ger 1T3+1 ERF (2–4).'; end if;

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
  (campaign_id,character_id,item_group,item_key,day_number,erf_cycle,amount,reason,awarded_by)
  values
  (v_character.campaign_id,v_character.id,p_item_group,p_item_key,v_state.day_number,v_state.erf_cycle,p_amount,p_reason,auth.uid())
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
    'new_erf',v_new_erf,
    'awarded',p_amount,
    'reason',p_reason,
    'day_number',v_state.day_number,
    'erf_cycle',v_state.erf_cycle,
    'item_group',p_item_group,
    'item_key',p_item_key
  );
end
$$;

revoke all on function public.award_character_erf(uuid,text,text,integer,text) from public;
revoke all on function public.award_character_erf(uuid,text,text,integer,text) from anon;
grant execute on function public.award_character_erf(uuid,text,text,integer,text) to authenticated;
