-- Aragorn v0.34.83: reuse legacy campaign images without copying them.
-- SECURITY INVOKER; caller must already be a GM/admin. Existing source RLS remains in force.
create or replace function public.aragorn_sync_legacy_materials(p_campaign_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $aragorn$
declare
  source_row record;
  registered_id uuid;
  added_count integer := 0;
  linked_count integer := 0;
  skipped_count integer := 0;
  changed_count integer;
  kind_mime text;
begin
  if p_campaign_id is null or (
    current_user not in ('postgres','supabase_admin') and
    not (select private.is_admin()) and
    not (select private.is_campaign_gm(p_campaign_id))
  ) then
    raise exception 'Only this campaign GM may synchronize library assets' using errcode='42501';
  end if;

  for source_row in
    select n.campaign_id, n.image_path as path, 'campaign-actor-images'::text as bucket,
           n.name as title, 'npc'::text as category, 'npc'::text as entity_type, n.id as entity_id
      from public.campaign_npcs n where n.campaign_id=p_campaign_id and n.image_path is not null
    union all
    select m.campaign_id, m.image_path, 'campaign-actor-images'::text,
           m.name, 'monster'::text, 'monster'::text, m.id
      from public.campaign_monsters m where m.campaign_id=p_campaign_id and m.image_path is not null
    union all
    select a.campaign_id, a.storage_path, 'campaign-location-assets'::text,
           coalesce(nullif(btrim(a.title),''), l.name), 'location'::text, 'location'::text, a.location_id
      from public.campaign_location_assets a
      join public.campaign_locations l on l.id=a.location_id and l.campaign_id=a.campaign_id
      where a.campaign_id=p_campaign_id and a.asset_kind='image'
    union all
    select s.campaign_id, s.background_image_path, 'combat-scene-maps'::text,
           s.name, 'map'::text, 'combat_scene'::text, s.id
      from public.campaign_combat_scenes s
      where s.campaign_id=p_campaign_id and s.background_image_path is not null
    union all
    select cm.campaign_id, cm.image_path, 'campaign-maps'::text,
           cm.name, 'map'::text, null::text, null::uuid
      from public.campaign_maps cm where cm.campaign_id=p_campaign_id and cm.image_path is not null
  loop
    -- Refuse malformed, foreign-campaign and non-image legacy references.
    if source_row.path is null
       or split_part(source_row.path,'/',1) <> p_campaign_id::text
       or source_row.path like '%..%' or source_row.path like '%//%'
       or source_row.path !~* '\.(png|jpe?g|webp)$'
    then
      skipped_count := skipped_count + 1;
      continue;
    end if;
    kind_mime := case
      when source_row.path ~* '\.png$' then 'image/png'
      when source_row.path ~* '\.jpe?g$' then 'image/jpeg'
      else 'image/webp' end;

    registered_id := null;
    insert into public.campaign_materials(
      campaign_id,title,description,category,asset_kind,storage_bucket,
      storage_path,mime_type,original_filename
    ) values (
      p_campaign_id,left(coalesce(nullif(btrim(source_row.title),''),'Namnlös bild'),160),
      '',source_row.category,'image',source_row.bucket,source_row.path,
      kind_mime, left(regexp_replace(source_row.path,'^.*/',''),160)
    )
    on conflict (campaign_id,storage_bucket,storage_path) do nothing
    returning id into registered_id;
    get diagnostics changed_count = row_count;
    added_count := added_count + changed_count;

    if registered_id is null then
      select id into registered_id from public.campaign_materials
       where campaign_id=p_campaign_id and storage_bucket=source_row.bucket
         and storage_path=source_row.path;
    end if;
    if registered_id is null then
      raise exception 'Could not register legacy material' using errcode='23514';
    end if;

    if source_row.entity_type is not null then
      insert into public.campaign_material_links(campaign_id,material_id,entity_type,entity_id)
      values (p_campaign_id,registered_id,source_row.entity_type,source_row.entity_id)
      on conflict (campaign_id,material_id,entity_type,entity_id) do nothing;
      get diagnostics changed_count = row_count;
      linked_count := linked_count + changed_count;
    end if;
  end loop;
  return jsonb_build_object('added',added_count,'links_added',linked_count,'skipped',skipped_count);
end;
$aragorn$;

revoke all on function public.aragorn_sync_legacy_materials(uuid) from public, anon;
grant execute on function public.aragorn_sync_legacy_materials(uuid) to authenticated;

-- Exact file-path access only. This does not make any bucket public and does
-- not grant access to unrelated portraits, unpublished scenes, or private notes.
-- Material SELECT itself is governed by the campaign_materials RLS rules.
drop policy if exists aragorn_linked_material_select on storage.objects;
create policy aragorn_linked_material_select on storage.objects
for select to authenticated using (
  bucket_id in ('campaign-actor-images','campaign-location-assets','campaign-maps','combat-scene-maps')
  and exists (
    select 1 from public.campaign_materials m
    where m.storage_bucket = storage.objects.bucket_id
      and m.storage_path = storage.objects.name
      and m.campaign_id::text = split_part(storage.objects.name,'/',1)
      and m.archived_at is null
      and (
        private.is_admin() or private.is_campaign_gm(m.campaign_id)
        or (private.is_campaign_member(m.campaign_id) and (
           exists (select 1 from public.campaign_material_shares s
             where s.campaign_id=m.campaign_id and s.material_id=m.id and s.revoked_at is null)
           or exists (select 1 from public.campaign_material_presentations p
             where p.campaign_id=m.campaign_id and p.material_id=m.id)
        ))
      )
  )
);

-- Existing originals are registered during rollout. Re-running the RPC remains idempotent.
do $seed$
declare campaign_row record;
begin
  for campaign_row in select id from public.campaigns loop
    perform public.aragorn_sync_legacy_materials(campaign_row.id);
  end loop;
end;
$seed$;
