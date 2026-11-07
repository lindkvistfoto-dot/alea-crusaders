-- HERMES ALEA adapter for the established Admin → Vapenlistan image field.
-- image_path remains the public compatibility URL used by existing renderers;
-- image_asset_id tracks the HERMES-managed upload and image_revision protects replacements.
alter table public.rule_weapons
  add column if not exists image_asset_id text,
  add column if not exists image_revision bigint not null default 0;

alter table public.hermes_alea_jobs
  drop constraint if exists hermes_alea_jobs_target_kind_check;
alter table public.hermes_alea_jobs
  add constraint hermes_alea_jobs_target_kind_check
  check (target_kind in ('definition','relief','weapon'));

create or replace function private.hermes_alea_can_manage(kind text, target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
   (kind='weapon' and private.is_admin() and exists(
     select 1 from public.rule_weapons w where w.id=target
   ))
   or (kind in ('definition','relief') and exists (
     select 1 from public.honor_definitions d
     where d.id = case when kind='definition' then target when kind='relief' then
       (select honor_id from public.honor_relief_variants where id=target) end
     and d.category in ('medal','award','badge')
     and (private.is_admin() or exists (
       select 1 from public.campaign_members m where m.user_id=auth.uid() and m.role='gm'
        and (m.campaign_id=d.campaign_id or (d.campaign_id is null and lower(d.name) in ('arcane laurel badge','sir robin','sir robin award')))
     ))
   ))
 )
$$;

create or replace function private.hermes_alea_target_lock(kind text,target uuid)
returns table(image_key text,revision bigint)
language plpgsql set search_path='' as $$
begin
 if kind='definition' then
  return query select d.image_asset_id,d.image_revision from public.honor_definitions d where d.id=target for update;
 elsif kind='relief' then
  return query select v.image_asset_id,v.image_revision from public.honor_relief_variants v where v.id=target for update;
 elsif kind='weapon' then
  return query select w.image_asset_id,w.image_revision from public.rule_weapons w where w.id=target for update;
 else raise exception 'BAD_TARGET';
 end if;
end $$;

create or replace function private.hermes_alea_target_set(kind text,target uuid,newkey text)
returns bigint language plpgsql set search_path='' as $$
declare rev bigint;
begin
 if kind='definition' then
  update public.honor_definitions set image_asset_id=newkey,updated_at=now()
  where id=target returning image_revision into rev;
 elsif kind='relief' then
  update public.honor_relief_variants set image_asset_id=newkey,updated_at=now()
  where id=target returning image_revision into rev;
 elsif kind='weapon' then
  update public.rule_weapons set image_asset_id=newkey,updated_at=now()
  where id=target returning image_revision into rev;
 else raise exception 'BAD_TARGET';
 end if;
 if not found then raise exception 'BAD_TARGET'; end if;
 return rev;
end $$;

create or replace function private.hermes_alea_weapon_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.image_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_revision:=0;
  return new;
 end if;
 if (new.image_asset_id is distinct from old.image_asset_id or new.image_revision is distinct from old.image_revision)
   and (old.image_asset_id like 'hermes-alea:%' or new.image_asset_id like 'hermes-alea:%'
     or new.image_revision is distinct from old.image_revision)
   and current_user in ('anon','authenticated') then
  raise exception 'USE_HERMES_ALEA';
 end if;
 new.image_revision:=old.image_revision + case when new.image_asset_id is distinct from old.image_asset_id then 1 else 0 end;
 return new;
end $$;

create trigger hermes_alea_weapon_guard before insert or update on public.rule_weapons
 for each row execute function private.hermes_alea_weapon_guard();
revoke all on function private.hermes_alea_weapon_guard() from public,anon,authenticated;
