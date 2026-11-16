-- Gimli: private material treasury (20 MiB, trusted MIME types, campaign isolation).
-- Existing campaign buckets remain unchanged.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('campaign-materials','campaign-materials',false,20971520,
  array['image/jpeg','image/png','image/webp','application/pdf','text/plain'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- A generated thumbnail is a private resource of its original material.
alter table public.campaign_materials
  add column if not exists thumbnail_path text;
alter table public.campaign_materials
  add constraint campaign_material_thumb_scope check (
    thumbnail_path is null or
    (storage_bucket='campaign-materials'
     and split_part(thumbnail_path,'/',1)=campaign_id::text
     and split_part(thumbnail_path,'/',2)=split_part(storage_path,'/',2)
     and split_part(thumbnail_path,'/',3)='thumb.webp'
     and array_length(string_to_array(thumbnail_path,'/'),1)=3)
  );

-- Restrict to a safe <campaign_uuid>/<upload_uuid>/<filename> hierarchy.
-- UUID checks are textual, so malformed input cannot cause unsafe casts.
create or replace function public.material_storage_path_valid(p_name text)
returns boolean
language sql immutable set search_path='' as $$
 select coalesce(
  p_name ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})/([a-zA-Z0-9][a-zA-Z0-9._-]{0,119})$'
   and p_name not like '%..%'
   and p_name not like '%//%',
  false)
$$;
revoke all on function public.material_storage_path_valid(text) from public;
grant execute on function public.material_storage_path_valid(text) to authenticated;

-- Uploads: authenticated GM/admin of campaign path only.
create policy campaign_materials_storage_insert
on storage.objects for insert to authenticated
with check (
 bucket_id='campaign-materials'
 and public.material_storage_path_valid(name)
 and exists (
   select 1 from public.campaigns c
   where c.id::text=split_part(storage.objects.name,'/',1)
   and (private.is_admin() or private.is_campaign_gm(c.id))
 )
);

-- Private file read: GM can inspect uploads (including orphans for recovery).
-- Campaign players only get bytes of a material that is currently presented
-- or still shared; archived files and unregistered orphans are unreadable.
create policy campaign_materials_storage_select
on storage.objects for select to authenticated
using (
 bucket_id='campaign-materials'
 and public.material_storage_path_valid(name)
 and exists (
   select 1 from public.campaigns c
   where c.id::text=split_part(storage.objects.name,'/',1)
   and (
     private.is_admin() or private.is_campaign_gm(c.id)
     or (
       private.is_campaign_member(c.id)
       and exists (
         select 1 from public.campaign_materials m
         where m.campaign_id=c.id and m.storage_bucket='campaign-materials'
           and m.archived_at is null
           and (m.storage_path=storage.objects.name or m.thumbnail_path=storage.objects.name)
           and (
             exists (
               select 1 from public.campaign_material_shares s
               where s.campaign_id=m.campaign_id and s.material_id=m.id
                 and s.revoked_at is null
             )
             or exists (
               select 1 from public.campaign_material_presentations p
               where p.campaign_id=m.campaign_id and p.material_id=m.id
             )
           )
       )
     )
   )
 )
);

-- No UPDATE policy. We deliberately disallow overwriting shared blobs.
-- A revised image must receive a fresh upload id and storage path.

-- Cleanup of orphan uploads allowed only for GM/admin and ONLY if neither
-- registered original nor its thumbnail refers to this blob.
create policy campaign_materials_storage_delete
on storage.objects for delete to authenticated
using (
 bucket_id='campaign-materials'
 and public.material_storage_path_valid(name)
 and exists (
   select 1 from public.campaigns c
   where c.id::text=split_part(storage.objects.name,'/',1)
     and (private.is_admin() or private.is_campaign_gm(c.id))
 )
 and not exists (
   select 1 from public.campaign_materials m
   where m.storage_bucket='campaign-materials'
     and (m.storage_path=storage.objects.name or m.thumbnail_path=storage.objects.name)
 )
);

-- A photo upload may be registered only after storage succeeded.
-- To clean a transaction's metadata on failure, GM may delete an unshared row.
-- Never allow deletion of material still shared or currently shown.
grant delete on public.campaign_materials to authenticated;
create or replace function public.prevent_shared_material_delete()
returns trigger language plpgsql set search_path='' as $$
begin
 if exists (select 1 from public.campaign_material_shares s
            where s.material_id=old.id)
    or exists (select 1 from public.campaign_material_presentations p
               where p.material_id=old.id) then
   raise exception 'Cannot delete material with presentation or share history';
 end if;
 return old;
end;
$$;
drop trigger if exists campaign_materials_protect_delete on public.campaign_materials;
create trigger campaign_materials_protect_delete
before delete on public.campaign_materials
for each row execute function public.prevent_shared_material_delete();

-- No public bucket, no anon permission and no changes to legacy storage RLS.
