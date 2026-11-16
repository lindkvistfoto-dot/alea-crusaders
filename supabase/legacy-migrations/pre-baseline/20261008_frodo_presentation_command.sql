-- Frodo v0.34.85: one explicit campaign presentation at a time.
-- Never automatically share material in the durable player library.
create or replace function public.frodo_set_presentation(
  p_campaign_id uuid,
  p_material_id uuid,
  p_expected_revision bigint
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $frodo$
declare
  v_revision bigint;
  v_available boolean;
begin
  if p_campaign_id is null or p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid campaign or presentation revision' using errcode='22023';
  end if;
  if not (select private.is_admin() or private.is_campaign_gm(p_campaign_id)) then
    raise exception 'Only the campaign GM can present material' using errcode='42501';
  end if;
  if not exists(select 1 from public.campaigns c where c.id=p_campaign_id) then
    raise exception 'Campaign does not exist' using errcode='23503';
  end if;
  if p_material_id is not null then
    -- SHARE lock serializes with archiving; a player cannot be shown archived material.
    select true into v_available from public.campaign_materials m
     where m.id=p_material_id and m.campaign_id=p_campaign_id
       and m.archived_at is null
     for share;
    if not coalesce(v_available,false) then
      raise exception 'Material is archived or does not belong to this campaign'
        using errcode='23514';
    end if;
  end if;
  if p_expected_revision <> 0 and not exists (
    select 1 from public.campaign_material_presentations p
     where p.campaign_id=p_campaign_id
  ) then
    raise exception 'Presentation changed; refresh before retrying' using errcode='P0001';
  end if;

  insert into public.campaign_material_presentations as current_presentation(
   campaign_id, material_id, shown_by, shown_at, revision, updated_at
  ) values (
   p_campaign_id,p_material_id,(select auth.uid()),
   case when p_material_id is null then null else now() end,
   1,now()
  )
  on conflict(campaign_id) do update
    set material_id=excluded.material_id,
        shown_by=excluded.shown_by,
        shown_at=excluded.shown_at,
        revision=current_presentation.revision+1,
        updated_at=now()
   where current_presentation.revision=p_expected_revision
  returning revision into v_revision;

  if v_revision is null then
    raise exception 'Presentation changed; refresh before retrying' using errcode='P0001';
  end if;

  return jsonb_build_object('campaign_id',p_campaign_id,
      'material_id',p_material_id,'revision',v_revision);
end;
$frodo$;

revoke all on function public.frodo_set_presentation(uuid,uuid,bigint) from public,anon;
grant execute on function public.frodo_set_presentation(uuid,uuid,bigint) to authenticated;

-- Protect the underlying table too, including changes attempted outside the RPC.
create or replace function public.frodo_validate_presentation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $frodo_trigger$
begin
  if new.material_id is not null and not exists (
    select 1 from public.campaign_materials m
     where m.id=new.material_id and m.campaign_id=new.campaign_id
       and m.archived_at is null
  ) then
    raise exception 'Cannot present archived or foreign campaign material' using errcode='23514';
  end if;
  return new;
end;
$frodo_trigger$;

drop trigger if exists frodo_validate_presentation on public.campaign_material_presentations;
create trigger frodo_validate_presentation
before insert or update of material_id,campaign_id
on public.campaign_material_presentations
for each row execute function public.frodo_validate_presentation();
