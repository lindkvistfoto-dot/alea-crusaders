-- HERMES CORE: isolated system-image pointer CAS for the Troferummet pilot.
-- Does not modify existing image rows or HERMES ALEA jobs.
-- Only existing, explicitly registered system asset keys may be changed.
alter table public.arcane_system_assets
 add column if not exists image_revision bigint not null default 0;

create or replace function public.hermes_core_system_image_read(p_asset_key text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.arcane_system_assets;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 select * into a from public.arcane_system_assets where asset_key=p_asset_key;
 if not found then raise exception 'UNKNOWN_SYSTEM_ASSET'; end if;
 return jsonb_build_object('key',a.asset_path,'revision',a.image_revision);
end $$;
revoke all on function public.hermes_core_system_image_read(text) from public,anon;
grant execute on function public.hermes_core_system_image_read(text) to authenticated;

-- The caller supplies a verified Storage path and metadata. The database
-- independently checks that the WebP object exists before changing the pointer.
create or replace function public.hermes_core_system_image_set(
 p_asset_key text, p_expected_revision bigint, p_expected_path text,
 p_new_path text, p_sha256 text default null, p_bytes integer default null,
 p_width integer default null, p_height integer default null,
 p_alpha_preserved boolean default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.arcane_system_assets; m jsonb;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 select * into a from public.arcane_system_assets where asset_key=p_asset_key for update;
 if not found then raise exception 'UNKNOWN_SYSTEM_ASSET'; end if;
 if a.image_revision<>p_expected_revision or a.asset_path is distinct from p_expected_path then
  raise exception 'IMAGE_REVISION_CONFLICT' using errcode='40001';
 end if;
 if p_new_path is not null then
  if p_new_path !~ ('^hermes/system-asset/' || p_asset_key || '/[a-f0-9]{64}[.]webp$') then raise exception 'INVALID_IMAGE_PATH'; end if;
  select metadata into m from storage.objects
   where bucket_id='alea-hermes-public' and name=p_new_path;
  if m is null or m->>'mimetype' is distinct from 'image/webp'
    or p_bytes is null or p_bytes<1 or p_bytes>12000000
    or coalesce((m->>'size')::bigint,-1)<>p_bytes
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_width is null or p_width not between 1 and 2048
    or p_height is null or p_height not between 1 and 2048
    or p_alpha_preserved is null
   then raise exception 'IMAGE_METADATA_MISMATCH'; end if;
 end if;
 update public.arcane_system_assets
 set asset_path=p_new_path, app_sha256=case when p_new_path is null then null else p_sha256 end,
 app_bytes=case when p_new_path is null then null else p_bytes end,
 width=case when p_new_path is null then null else p_width end,
 height=case when p_new_path is null then null else p_height end,
 alpha_preserved=case when p_new_path is null then null else p_alpha_preserved end,
 image_revision=image_revision+1
 where id=a.id returning * into a;
 return jsonb_build_object('key',a.asset_path,'revision',a.image_revision);
end $$;
revoke all on function public.hermes_core_system_image_set(text,bigint,text,text,text,integer,integer,integer,boolean) from public,anon;
grant execute on function public.hermes_core_system_image_set(text,bigint,text,text,text,integer,integer,integer,boolean) to authenticated;
