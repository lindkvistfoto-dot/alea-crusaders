-- Four armor destinations in the existing HERMES ALEA lifecycle.
-- Legacy paths and SVG icon_key remain unchanged. No existing images are migrated.
alter table public.rule_armor_types
 add column if not exists image_head_asset_id text,
 add column if not exists image_head_revision bigint not null default 0,
 add column if not exists image_arms_asset_id text,
 add column if not exists image_arms_revision bigint not null default 0,
 add column if not exists image_torso_asset_id text,
 add column if not exists image_torso_revision bigint not null default 0,
 add column if not exists image_legs_asset_id text,
 add column if not exists image_legs_revision bigint not null default 0;

alter table public.hermes_alea_jobs
  drop constraint if exists hermes_alea_jobs_target_kind_check;
alter table public.hermes_alea_jobs
  add constraint hermes_alea_jobs_target_kind_check
  check (target_kind in ('definition','relief','weapon','armor_head','armor_arms','armor_torso','armor_legs'));

create or replace function private.hermes_alea_can_manage(kind text, target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
   (kind='weapon' and private.is_admin() and exists(
     select 1 from public.rule_weapons w where w.id=target
   ))
   or (kind in ('armor_head','armor_arms','armor_torso','armor_legs') and private.is_admin() and exists(
     select 1 from public.rule_armor_types a where a.id=target
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
 elsif kind='armor_head' then
  return query select a.image_head_asset_id,a.image_head_revision from public.rule_armor_types a where a.id=target for update;
 elsif kind='armor_arms' then
  return query select a.image_arms_asset_id,a.image_arms_revision from public.rule_armor_types a where a.id=target for update;
 elsif kind='armor_torso' then
  return query select a.image_torso_asset_id,a.image_torso_revision from public.rule_armor_types a where a.id=target for update;
 elsif kind='armor_legs' then
  return query select a.image_legs_asset_id,a.image_legs_revision from public.rule_armor_types a where a.id=target for update;
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
 elsif kind='armor_head' then
  update public.rule_armor_types set image_head_asset_id=newkey,image_head_revision=image_head_revision+1,updated_at=now()
  where id=target returning image_head_revision into rev;
 elsif kind='armor_arms' then
  update public.rule_armor_types set image_arms_asset_id=newkey,image_arms_revision=image_arms_revision+1,updated_at=now()
  where id=target returning image_arms_revision into rev;
 elsif kind='armor_torso' then
  update public.rule_armor_types set image_torso_asset_id=newkey,image_torso_revision=image_torso_revision+1,updated_at=now()
  where id=target returning image_torso_revision into rev;
 elsif kind='armor_legs' then
  update public.rule_armor_types set image_legs_asset_id=newkey,image_legs_revision=image_legs_revision+1,updated_at=now()
  where id=target returning image_legs_revision into rev;
 else raise exception 'BAD_TARGET';
 end if;
 if not found then raise exception 'BAD_TARGET'; end if;
 return rev;
end $$;

-- Reuse the managed-pointer boundary already applied to weapon images.
-- Revision also records REMOVE of legacy-only art without writing its old path.
create or replace function private.hermes_alea_armor_guard() returns trigger
language plpgsql set search_path='' as $$
begin
 if TG_OP='INSERT' then
  if new.image_head_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_head_revision:=0;
 else
  if (new.image_head_asset_id is distinct from old.image_head_asset_id or new.image_head_revision is distinct from old.image_head_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_head_revision:=old.image_head_revision+case when new.image_head_asset_id is distinct from old.image_head_asset_id
   or new.image_head_revision is distinct from old.image_head_revision then 1 else 0 end;
 end if;
 if TG_OP='INSERT' then
  if new.image_arms_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_arms_revision:=0;
 else
  if (new.image_arms_asset_id is distinct from old.image_arms_asset_id or new.image_arms_revision is distinct from old.image_arms_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_arms_revision:=old.image_arms_revision+case when new.image_arms_asset_id is distinct from old.image_arms_asset_id
   or new.image_arms_revision is distinct from old.image_arms_revision then 1 else 0 end;
 end if;
 if TG_OP='INSERT' then
  if new.image_torso_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_torso_revision:=0;
 else
  if (new.image_torso_asset_id is distinct from old.image_torso_asset_id or new.image_torso_revision is distinct from old.image_torso_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_torso_revision:=old.image_torso_revision+case when new.image_torso_asset_id is distinct from old.image_torso_asset_id
   or new.image_torso_revision is distinct from old.image_torso_revision then 1 else 0 end;
 end if;
 if TG_OP='INSERT' then
  if new.image_legs_asset_id like 'hermes-alea:%' then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_legs_revision:=0;
 else
  if (new.image_legs_asset_id is distinct from old.image_legs_asset_id or new.image_legs_revision is distinct from old.image_legs_revision)
   and current_user in ('anon','authenticated') then raise exception 'USE_HERMES_ALEA'; end if;
  new.image_legs_revision:=old.image_legs_revision+case when new.image_legs_asset_id is distinct from old.image_legs_asset_id
   or new.image_legs_revision is distinct from old.image_legs_revision then 1 else 0 end;
 end if;
 return new;
end $$;
create trigger hermes_alea_armor_guard before insert or update on public.rule_armor_types
 for each row execute function private.hermes_alea_armor_guard();
revoke all on function private.hermes_alea_armor_guard() from public,anon,authenticated;

-- Active, still-referenced armor display objects have the same signed-in read
-- scope as weapons. Originals remain uploader/manager scoped in private storage.
create or replace function private.hermes_alea_armor_active(kind text,target uuid,key text)
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.rule_armor_types a where a.id=target and case kind
   when 'armor_head' then a.image_head_asset_id=key
   when 'armor_arms' then a.image_arms_asset_id=key
   when 'armor_torso' then a.image_torso_asset_id=key
   when 'armor_legs' then a.image_legs_asset_id=key
   else false end
 )
$$;
revoke all on function private.hermes_alea_armor_active(text,uuid,text) from public,anon;
grant execute on function private.hermes_alea_armor_active(text,uuid,text) to authenticated;

alter view public.hermes_alea_assets
  set (security_invoker = false, security_barrier = true);

create or replace view public.hermes_alea_assets as
select
  'hermes-alea:' || j.id::text as asset_key,
  j.output_path as asset_path,
  j.width,
  j.height,
  j.alpha_preserved,
  'published'::text as publication_status
from public.hermes_alea_jobs j
where j.state = 'activated'
  and j.output_deleted_at is null
  and j.output_delete_reserved_at is null
  and (
    (
      j.target_kind = 'weapon'
      and exists (
        select 1
        from public.rule_weapons w
        where w.id = j.target_id
          and w.image_asset_id = 'hermes-alea:' || j.id::text
      )
    )
    or private.hermes_alea_armor_active(j.target_kind,j.target_id,'hermes-alea:' || j.id::text)
    or private.hermes_alea_can_manage(j.target_kind, j.target_id)
  );

revoke all on public.hermes_alea_assets from public, anon;
grant select on public.hermes_alea_assets to authenticated;

-- Signing a URL runs the storage SELECT policy. Managers retain the existing
-- scoped access; other authenticated consumers may sign only a live weapon
-- display object that is still the active rule_weapons pointer.
create or replace function private.hermes_alea_storage_allowed(bucket text, path text, reading boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.hermes_alea_jobs j
    where (
      private.hermes_alea_can_manage(j.target_kind, j.target_id)
      or (
        bucket = 'hermes-alea-display'
        and (j.target_kind = 'weapon' or private.hermes_alea_armor_active(j.target_kind,j.target_id,'hermes-alea:' || j.id::text))
        and j.state = 'activated'
        and (private.hermes_alea_armor_active(j.target_kind,j.target_id,'hermes-alea:' || j.id::text) or exists (
          select 1
          from public.rule_weapons w
          where w.id = j.target_id
            and w.image_asset_id = 'hermes-alea:' || j.id::text
        ))
      )
    )
    and (
      (bucket = 'hermes-alea-originals' and path = j.source_path and j.requested_by = auth.uid())
      or (bucket = 'hermes-alea-display' and path = j.output_path)
    )
    and case
      when reading then
        j.output_delete_reserved_at is null
        and j.output_deleted_at is null
        and (
          bucket <> 'hermes-alea-display'
          or j.state = 'activated'
          or private.hermes_alea_can_manage(j.target_kind, j.target_id)
        )
      else
        private.hermes_alea_can_manage(j.target_kind, j.target_id)
        and j.requested_by = auth.uid()
        and j.state = 'uploading'
        and j.verified_at is null
        and j.created_at > now() - interval '24 hours'
        and (select enabled from private.hermes_alea_settings where singleton)
    end
  );
$$;

revoke all on function private.hermes_alea_storage_allowed(text, text, boolean) from public, anon;
grant execute on function private.hermes_alea_storage_allowed(text, text, boolean) to authenticated;

-- Include armor originals in the established seven-day archive retention.
create or replace view public.hermes_alea_cleanup_report as
select
  id,
  source_path,
  output_path,
  archive_state,
  archive_drive_id,
  source_sha256,
  output_sha256,
  (target_kind = any (array['definition'::text, 'relief'::text, 'weapon'::text,'armor_head'::text,'armor_arms'::text,'armor_torso'::text,'armor_legs'::text]))
    and archive_state = 'verified'
    and archive_drive_id is not null
    and archive_verified_at <= (now() - interval '7 days')
    and source_deleted_at is null as source_candidate,
  (target_kind = any (array['definition'::text, 'relief'::text]))
    and state = 'activated'
    and archive_state = 'verified'
    and archive_drive_id is not null
    and exists (
      select 1
      from public.hermes_alea_jobs e
      where e.previous_key = ('hermes-alea:'::text || j.id::text)
        and e.detached_at is not null
    )
    and (
      select max(e.detached_at)
      from public.hermes_alea_jobs e
      where e.previous_key = ('hermes-alea:'::text || j.id::text)
    ) <= (now() - interval '30 days')
    and not exists (
      select 1 from public.honor_definitions d
      where d.image_asset_id = ('hermes-alea:'::text || j.id::text)
    )
    and not exists (
      select 1 from public.honor_relief_variants v
      where v.image_asset_id = ('hermes-alea:'::text || j.id::text)
    )
    and output_deleted_at is null as output_candidate,
  state = 'uploading'
    and operation <> 'REMOVE'
    and created_at <= (now() - interval '24 hours')
    and (lease_until is null or lease_until <= now())
    and archive_state = 'not_required'
    and archive_drive_id is null
    and not exists (
      select 1
      from public.hermes_alea_jobs e
      where e.id <> j.id
        and e.previous_key = ('hermes-alea:'::text || j.id::text)
    )
    and not exists (
      select 1 from public.honor_definitions d
      where d.image_asset_id = ('hermes-alea:'::text || j.id::text)
    )
    and not exists (
      select 1 from public.honor_relief_variants v
      where v.image_asset_id = ('hermes-alea:'::text || j.id::text)
    ) as abandoned_candidate
from public.hermes_alea_jobs j;
