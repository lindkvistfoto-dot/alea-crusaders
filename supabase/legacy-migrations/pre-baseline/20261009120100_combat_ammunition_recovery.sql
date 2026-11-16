-- v0.35.13 — SL-controlled, server-rolled, one-time recovery after battle.
-- Each spent projectile receives an independent recovery roll (default 85%).
create or replace function public.combat_finish_and_recover(p_combat_id uuid,p_allow_recovery boolean,p_percent integer default 85)
returns jsonb language plpgsql security definer set search_path='' as $$
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
revoke all on function public.combat_finish_and_recover(uuid,boolean,integer) from public,anon;
grant execute on function public.combat_finish_and_recover(uuid,boolean,integer) to authenticated;
