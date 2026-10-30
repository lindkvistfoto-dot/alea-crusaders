-- HERMES CORE CREATE: register a new system image only after WebP is present.
-- Existing system image rows are never overwritten by this function.
create or replace function public.hermes_core_system_image_create(
 p_asset_key text, p_label text, p_path text, p_sha256 text,
 p_bytes integer, p_width integer, p_height integer, p_alpha_preserved boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; a public.arcane_system_assets;
begin
 if auth.uid() is null or not private.is_admin() then
  raise exception 'FORBIDDEN' using errcode='42501';
 end if;
 if p_asset_key !~ '^[a-z0-9][a-z0-9_-]*$'
    or nullif(btrim(p_label),'') is null
    or p_sha256 !~ '^[a-f0-9]{64}$'
    or p_path is distinct from ('hermes/system-asset/'||p_asset_key||'/'||p_sha256||'.webp')
    or p_bytes not between 1 and 12000000
    or p_width not between 1 and 2048 or p_height not between 1 and 2048
    or p_alpha_preserved is null
 then raise exception 'INVALID_IMAGE_METADATA'; end if;
 select metadata into m from storage.objects
  where bucket_id='alea-hermes-public' and name=p_path;
 if m is null or m->>'mimetype' is distinct from 'image/webp'
    or coalesce((m->>'size')::bigint,-1)<>p_bytes
 then raise exception 'UPLOAD_NOT_VERIFIED'; end if;
 insert into public.arcane_system_assets
 (id,asset_key,label,asset_path,app_sha256,app_bytes,width,height,alpha_preserved,image_revision)
 values(gen_random_uuid(),p_asset_key,p_label,p_path,p_sha256,p_bytes,p_width,p_height,p_alpha_preserved,1)
 on conflict(asset_key) do nothing returning * into a;
 if not found then raise exception 'SYSTEM_ASSET_ALREADY_EXISTS'; end if;
 return jsonb_build_object('key',a.asset_path,'revision',a.image_revision,'asset_key',a.asset_key);
end $$;
revoke all on function public.hermes_core_system_image_create(text,text,text,text,integer,integer,integer,boolean) from public,anon;
grant execute on function public.hermes_core_system_image_create(text,text,text,text,integer,integer,integer,boolean) to authenticated;
