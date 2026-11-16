-- Sam Gamgi v0.34.86: explicitly persist/revoke campaign materials in player library.
-- Shares are scoped to the campaign, guarded by existing GM-only RLS.
create or replace function public.sam_set_material_share(
 p_campaign_id uuid,
 p_material_id uuid,
 p_shared boolean
)
returns jsonb language plpgsql security invoker set search_path=''
as $sam$
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
$sam$;

revoke all on function public.sam_set_material_share(uuid,uuid,boolean) from public,anon;
grant execute on function public.sam_set_material_share(uuid,uuid,boolean) to authenticated;

-- Even direct GM inserts must not accidentally share archived media.
create or replace function public.sam_guard_material_share()
returns trigger language plpgsql security invoker set search_path=''
as $sam_guard$
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
$sam_guard$;
drop trigger if exists sam_guard_material_share on public.campaign_material_shares;
create trigger sam_guard_material_share
before insert or update of campaign_id,material_id,revoked_at
on public.campaign_material_shares
for each row execute function public.sam_guard_material_share();
