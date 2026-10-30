-- Alea v0.35.130: reusable hit-area artwork, indexed by Expert race and gender.
-- Each complete series consists of neutral plus seven rolled hit areas.
-- These are shared rules/UI assets, not campaign material or player portraits.
create table if not exists public.rule_hit_figure_images (
  id uuid primary key default gen_random_uuid(),
  race_id text not null references public.rule_races(id) on delete restrict,
  gender text not null check (gender in ('male','female')),
  body_part text not null check (body_part in (
    'neutral','head','chest','abdomen','left_arm','right_arm','left_leg','right_leg'
  )),
  image_path text not null unique check (
    image_path ~ '^figure/[0-9a-f-]{36}\.webp$'
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (race_id,gender,body_part)
);
create index if not exists rule_hit_figure_lookup_idx on public.rule_hit_figure_images (race_id,gender);
alter table public.rule_hit_figure_images enable row level security;
revoke all on public.rule_hit_figure_images from anon;
grant select,insert,update,delete on public.rule_hit_figure_images to authenticated;
create policy hit_figure_read on public.rule_hit_figure_images
 for select to authenticated using (true);
create policy hit_figure_admin_insert on public.rule_hit_figure_images
 for insert to authenticated with check ((select private.is_admin()));
create policy hit_figure_admin_update on public.rule_hit_figure_images
 for update to authenticated using ((select private.is_admin()))
 with check ((select private.is_admin()));
create policy hit_figure_admin_delete on public.rule_hit_figure_images
 for delete to authenticated using ((select private.is_admin()));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('alea-hit-figures','alea-hit-figures',false,4194304,array['image/webp'])
on conflict (id) do update set
 public=false,file_size_limit=excluded.file_size_limit,
 allowed_mime_types=excluded.allowed_mime_types;
create policy hit_figure_storage_read on storage.objects
 for select to authenticated using (
  bucket_id='alea-hit-figures'
  and name ~ '^figure/[0-9a-f-]{36}\.webp$'
 );
create policy hit_figure_storage_admin_upload on storage.objects
 for insert to authenticated with check (
  bucket_id='alea-hit-figures'
  and name ~ '^figure/[0-9a-f-]{36}\.webp$'
  and (select private.is_admin())
 );
-- Deleting a registered image requires first deleting/replacing its record.
-- Prevents a half-broken set if an image is removed accidentally from Storage.
create policy hit_figure_storage_admin_cleanup on storage.objects
 for delete to authenticated using (
  bucket_id='alea-hit-figures'
  and name ~ '^figure/[0-9a-f-]{36}\.webp$'
  and (select private.is_admin())
  and not exists(select 1 from public.rule_hit_figure_images i where i.image_path=storage.objects.name)
 );
