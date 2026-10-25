-- ARCANE HONORS catalogue, tier criteria and permanent relief library.
-- Additive only: preserve all existing definitions, grants and grant history.
alter table public.honor_definitions add column if not exists category text;
update public.honor_definitions
set category = case when type = 'adventure' then 'medal' else 'award' end
where category is null;
alter table public.honor_definitions alter column category set default 'award';
alter table public.honor_definitions alter column category set not null;
alter table public.honor_definitions add column if not exists tier_criteria jsonb not null default '{}'::jsonb;
alter table public.honor_definitions add column if not exists badge_frame_assets jsonb not null default '{}'::jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'honor_definitions_category_check') then
    alter table public.honor_definitions add constraint honor_definitions_category_check
      check (category in ('medal','award','badge'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'honor_definitions_tier_criteria_object') then
    alter table public.honor_definitions add constraint honor_definitions_tier_criteria_object
      check (jsonb_typeof(tier_criteria) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'honor_definitions_badge_frames_object') then
    alter table public.honor_definitions add constraint honor_definitions_badge_frames_object
      check (jsonb_typeof(badge_frame_assets) = 'object');
  end if;
end $$;
alter table public.honor_definitions add column if not exists frame_family text;
alter table public.honor_definitions add column if not exists preview_variant_id uuid;
alter table public.honor_definitions add column if not exists published_variant_id uuid;

create table if not exists public.honor_relief_variants (
  id uuid primary key default gen_random_uuid(),
  honor_id uuid not null references public.honor_definitions(id) on delete restrict,
  name text not null check (length(btrim(name)) > 0),
  material text not null check (material in ('enamel','metal','wood','stone','other')),
  image_asset_id text check (image_asset_id is null or length(btrim(image_asset_id)) > 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  allow_overhang boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (honor_id, name)
);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'honor_definitions_preview_variant_fkey') then
    alter table public.honor_definitions add constraint honor_definitions_preview_variant_fkey
      foreign key (preview_variant_id) references public.honor_relief_variants(id) on delete restrict;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'honor_definitions_published_variant_fkey') then
    alter table public.honor_definitions add constraint honor_definitions_published_variant_fkey
      foreign key (published_variant_id) references public.honor_relief_variants(id) on delete restrict;
  end if;
end $$;
create index if not exists honor_relief_variants_honor_id_idx on public.honor_relief_variants(honor_id);
create index if not exists honor_definitions_category_status_idx on public.honor_definitions(category,status);

alter table public.honor_relief_variants enable row level security;
drop policy if exists honor_relief_variants_manager_access on public.honor_relief_variants;
create policy honor_relief_variants_manager_access on public.honor_relief_variants
  for all to authenticated
  using (
    private.is_admin() or exists (
      select 1 from public.honor_definitions d
      join public.campaign_members m on m.campaign_id = d.campaign_id
      where d.id = honor_relief_variants.honor_id
        and m.user_id = (select auth.uid()) and m.role = 'gm'
    )
  )
  with check (
    private.is_admin() or exists (
      select 1 from public.honor_definitions d
      join public.campaign_members m on m.campaign_id = d.campaign_id
      where d.id = honor_relief_variants.honor_id
        and m.user_id = (select auth.uid()) and m.role = 'gm'
    )
  );
grant select, insert, update on public.honor_relief_variants to authenticated;
grant delete on public.honor_definitions to authenticated;
drop policy if exists honor_definitions_admin_delete on public.honor_definitions;
create policy honor_definitions_admin_delete on public.honor_definitions
  for delete to authenticated
  using (
    status = 'draft' and not exists (select 1 from public.honor_grants g where g.honor_id = honor_definitions.id)
    and (private.is_admin() or (campaign_id is not null and exists (
      select 1 from public.campaign_members m
      where m.campaign_id = honor_definitions.campaign_id
        and m.user_id = (select auth.uid()) and m.role = 'gm'
    )))
  );

-- Existing Sir Robin stays draft/manual with all existing grants untouched.
update public.honor_definitions set category = 'award'
where lower(name) in ('sir robin','sir robin award') and category <> 'award';

-- Register the shared badge frame family in the existing Honors catalogue.
insert into public.honor_definitions
  (name,type,description,requirement_text,visibility,grant_mode,status,category,
   tier_criteria,badge_frame_assets,frame_family,image_asset_id,created_by)
select 'ARCANE LAUREL BADGE','honor',
       'Gemensam lagerkransram i brons, silver eller guld med separat relief.',
       '', 'public','manual','draft','badge','{}'::jsonb,
       '{"bronze":"arcane-laurel-badge-bronze","silver":"arcane-laurel-badge-silver","gold":"arcane-laurel-badge-gold"}'::jsonb,
       'arcane_laurel_badge','arcane-laurel-badge-bronze', p.id
from public.profiles p
where p.is_admin = true
  and not exists (select 1 from public.honor_definitions where name = 'ARCANE LAUREL BADGE')
order by p.created_at asc
limit 1;

-- Keep the three approved Sir Robin concepts as separate draft records.
insert into public.honor_relief_variants (honor_id,name,material,status,allow_overhang,created_by)
select d.id,v.name,v.material,'draft',true,d.created_by
from public.honor_definitions d
cross join (values ('Emalj','enamel'),('Metallrelief','metal'),('Snidat trä','wood')) as v(name,material)
where lower(d.name) in ('sir robin','sir robin award')
on conflict (honor_id,name) do nothing;

-- Drafts remain admin/GM-only. No player policy is introduced by this migration.
comment on table public.honor_relief_variants is
  'Permanent ARCANE HONORS relief options; preview and published pointers are separate on honor_definitions.';
