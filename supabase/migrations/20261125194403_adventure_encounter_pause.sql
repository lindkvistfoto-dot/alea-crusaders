-- A paused encounter keeps its initiative, actions and movement budget.
create function public.set_adventure_encounter_paused(p_encounter uuid,p_paused boolean)
returns void language plpgsql security definer set search_path='' as $$
declare i public.combat_instances;
begin
  select * into strict i from public.combat_instances where id=p_encounter
    and settings->>'origin'='adventure' for update;
  if (private.is_campaign_gm(i.campaign_id) or private.is_admin()) is not true then
    raise exception 'Endast SL kan pausa eller återuppta striden.' using errcode='42501';
  end if;
  if p_paused is null or i.status not in ('active','paused') then raise exception 'Striden är avslutad.'; end if;
  if (i.status='paused')=p_paused then return; end if;
  if not p_paused then
    perform 1 from public.adventure_map_figures where session_id=i.session_id and map_id=i.map_id for update;
    update public.combatants c set q=f.q,r=f.r from public.adventure_map_figures f
      where c.combat_id=i.id and c.source_instance_key=f.id::text and f.session_id=i.session_id
        and f.map_id=i.map_id and (c.q,c.r) is distinct from (f.q,f.r);
  end if;
  update public.combat_instances set status=case when p_paused then 'paused' else 'active' end where id=i.id;
  update public.adventure_hex_state set epoch=epoch+1 where map_id=i.map_id and session_id=i.session_id;
end $$;
revoke all on function public.set_adventure_encounter_paused(uuid,boolean) from public,anon;
grant execute on function public.set_adventure_encounter_paused(uuid,boolean) to authenticated;
