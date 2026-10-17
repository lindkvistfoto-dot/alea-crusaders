-- ALEA CRUSADERS: two independent artwork slots for master skills.
-- Immutable source images are retained so a later HERMES importer can reuse them.
alter table public.rule_skills
 add column if not exists icon_path text,
 add column if not exists illustration_path text;

alter table public.rule_skills drop constraint if exists rule_skills_icon_path_scoped;
alter table public.rule_skills add constraint rule_skills_icon_path_scoped check (
 icon_path is null or (
  icon_path ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/icon/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp)$'
  and split_part(icon_path,'/',2) = id
 )
);
alter table public.rule_skills drop constraint if exists rule_skills_illustration_path_scoped;
alter table public.rule_skills add constraint rule_skills_illustration_path_scoped check (
 illustration_path is null or (
  illustration_path ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/illustration/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg)$'
  and split_part(illustration_path,'/',2) = id
 )
);

comment on column public.rule_skills.icon_path is 'FÄRDIGHET IKON: immutable alpha-enabled square PNG/WebP in private alea-skill-art bucket.';
comment on column public.rule_skills.illustration_path is 'FÄRDIGHET ILLUSTRATION: immutable square high-fantasy image in private alea-skill-art bucket.';

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('alea-skill-art','alea-skill-art',false,16777216,array['image/png','image/webp','image/jpeg'])
on conflict(id) do update set
 public=false, file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists skill_art_read on storage.objects;
create policy skill_art_read on storage.objects
 for select to authenticated using (
  bucket_id='alea-skill-art'
  and name ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/(icon|illustration)/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg)$'
  and exists (select 1 from public.rule_skills sk where sk.id=split_part(storage.objects.name,'/',2))
 );

drop policy if exists skill_art_upload_admin on storage.objects;
create policy skill_art_upload_admin on storage.objects
 for insert to authenticated with check (
  bucket_id='alea-skill-art'
  and (select private.is_admin())
  and name ~ '^skill/[a-z0-9][a-z0-9_-]{0,99}/(icon|illustration)/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.](png|webp|jpg)$'
  and not (split_part(storage.objects.name,'/',3)='icon' and storage.objects.name ~ '[.]jpg$')
  and exists (select 1 from public.rule_skills sk where sk.id=split_part(storage.objects.name,'/',2))
 );
-- No DELETE or UPDATE storage permissions: old assets remain available for historical references.
