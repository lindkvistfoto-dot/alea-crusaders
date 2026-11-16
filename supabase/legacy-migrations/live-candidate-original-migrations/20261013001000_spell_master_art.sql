-- Alea Crusaders: immutable artwork for Expert spell masters.
-- The combat action snapshot retains the file path and focus even after an
-- administrator later replaces or removes the master artwork.
alter table public.rule_spells
  add column if not exists image_path text,
  add column if not exists image_focus_x integer not null default 80,
  add column if not exists image_focus_y integer not null default 78;

alter table public.rule_spells
  drop constraint if exists rule_spells_image_path_scoped;
alter table public.rule_spells
  add constraint rule_spells_image_path_scoped check (
    image_path is null or (
      image_path ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      and split_part(image_path,'/',2)=id::text
    )
  );
alter table public.rule_spells
  drop constraint if exists rule_spells_image_focus_bounds;
alter table public.rule_spells
  add constraint rule_spells_image_focus_bounds check (
    image_focus_x between 0 and 100 and image_focus_y between 0 and 100
  );

comment on column public.rule_spells.image_path is
  'Private immutable WebP path spell/<spell uuid>/<image uuid>.webp, used as a combat-action snapshot.';
comment on column public.rule_spells.image_focus_x is 'Horizontal background crop focus, percent.';
comment on column public.rule_spells.image_focus_y is 'Vertical background crop focus, percent.';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('alea-spell-art','alea-spell-art',false,6291456,array['image/webp'])
on conflict(id) do update set
  public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

-- Artwork is visible only to authenticated users of the game's registry.
-- Master edits and uploads are global-admin only.
drop policy if exists spell_art_read on storage.objects;
create policy spell_art_read on storage.objects
  for select to authenticated using (
    bucket_id='alea-spell-art' and
    name ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  );
drop policy if exists spell_art_upload_admin on storage.objects;
create policy spell_art_upload_admin on storage.objects
  for insert to authenticated with check (
    bucket_id='alea-spell-art' and (select private.is_admin()) and
    name ~ '^spell/[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$' and
    exists (
      select 1 from public.rule_spells s
      where s.id::text=split_part(storage.objects.name,'/',2)
    )
  );
-- Do not grant storage deletion: old combat-action snapshots must remain readable.
