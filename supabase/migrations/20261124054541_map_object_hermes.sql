-- Extend the existing image lifecycle with the Living Objects template target.
alter table public.arcane_object_definitions add column image_revision bigint not null default 0,
 alter column image_asset_key set default '';
create index arcane_object_image_refs on public.arcane_object_definitions(image_asset_key);
create index living_object_definition_refs on public.campaign_map_objects(object_definition_id);
grant select on public.arcane_object_definitions to service_role;
grant update(image_asset_key), insert(id,object_key,object_type,name,image_asset_key,image_crop,library_category,campaign_id,width_m,depth_m,height_m,max_bep,description) on public.arcane_object_definitions to service_role;

-- Preserve valid target kinds while admitting the additional image destination.
alter table public.hermes_alea_jobs drop constraint hermes_alea_jobs_target_kind_check,
 add constraint hermes_alea_jobs_target_kind_check check(target_kind in
 ('definition','relief','weapon','armor_head','armor_arms','armor_torso','armor_legs','map-object'));

-- One counter covers both CORE and ALEA replacements; crop coordinates belong to the previous image.
create function private.map_object_image_change() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='INSERT' then
   new.image_revision:=0;
   -- Admin may make a campaign copy of an existing image, including a signed image reference.
   if current_user in ('authenticated','anon') and new.image_asset_key<>'' and not exists(
      select 1 from public.arcane_object_definitions d where d.image_asset_key=new.image_asset_key
      and (d.campaign_id is null or d.campaign_id=new.campaign_id)) then raise exception 'USE_HERMES'; end if;
 else
   if new.image_asset_key is distinct from old.image_asset_key then
     if current_user in ('authenticated','anon') then raise exception 'USE_HERMES'; end if;
     new.image_crop:='{}';
     new.image_revision:=old.image_revision+1;
   else new.image_revision:=old.image_revision; end if;
 end if;
 return new;
end $$;
revoke all on function private.map_object_image_change() from public,anon,authenticated;
create trigger map_object_image_change before insert or update on public.arcane_object_definitions
 for each row execute function private.map_object_image_change();

-- Signing follows the active image reference, including copies of common templates.
-- Player scope is the same projection that actually renders a discovered map object.
create function private.can_read_map_object_art(art text) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(
  select 1 from public.arcane_object_definitions d where d.image_asset_key=art and (
    private.is_admin() or private.is_campaign_gm(d.campaign_id)
    or (d.campaign_id is null and exists(select 1 from public.campaign_members g
      where g.user_id=auth.uid() and g.role='gm'))
    or exists(select 1 from public.campaign_map_objects o join public.campaign_maps m on m.id=o.map_id
      where o.object_definition_id=d.id and m.player_visible and o.player_visible and private.is_campaign_member(m.campaign_id)
       and o.live=(m.objects_initialized_at is not null)
       and public.read_adventure_player_objects(m.id) @> jsonb_build_array(jsonb_build_object('id',o.id)))
  ))
$$;
revoke all on function private.can_read_map_object_art(text) from public,anon;
grant execute on function private.can_read_map_object_art(text) to authenticated;

create policy map_object_core_display on storage.objects for select to authenticated
 using(bucket_id='campaign-materials' and name like 'map-objects/%' and private.can_read_map_object_art(name));

create or replace function private.hermes_alea_can_manage(kind text, target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (
   (kind='map-object' and private.is_admin() and exists(
     select 1 from public.arcane_object_definitions d where d.id=target and d.battle_object_key is null))
   or (kind='weapon' and private.is_admin() and exists(
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
 if kind='map-object' then
  return query select nullif(d.image_asset_key,''),d.image_revision from public.arcane_object_definitions d where d.id=target and d.battle_object_key is null for update;
 elsif kind='definition' then
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
 if kind='map-object' then
  update public.arcane_object_definitions set image_asset_key=coalesce(newkey,'') where id=target and battle_object_key is null returning image_revision into rev;
 elsif kind='definition' then
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
      (reading and bucket='hermes-alea-display' and j.target_kind='map-object' and j.state='activated'
       and private.can_read_map_object_art('hermes-alea:'||j.id::text))
      or private.hermes_alea_can_manage(j.target_kind, j.target_id)
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
    or (j.target_kind='map-object' and private.can_read_map_object_art('hermes-alea:'||j.id::text))
    or private.hermes_alea_can_manage(j.target_kind, j.target_id)
  );

create or replace view public.hermes_alea_cleanup_report as
select
  id,
  source_path,
  output_path,
  archive_state,
  archive_drive_id,
  source_sha256,
  output_sha256,
  (target_kind = any (array['definition'::text, 'relief'::text, 'weapon'::text,'armor_head'::text,'armor_arms'::text,'armor_torso'::text,'armor_legs'::text,'map-object'::text]))
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
