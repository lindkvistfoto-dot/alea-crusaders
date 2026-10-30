-- Shared, non-campaign UI masters. Only the existing trusted HERMES publisher
-- may activate their immutable WebP pointers. No new bucket or original upload.
alter table public.hermes_jobs drop constraint hermes_jobs_kind_check;
alter table public.hermes_jobs add constraint hermes_jobs_kind_check check (
  kind in ('spell', 'spell-cutout', 'symbol', 'skill', 'skill-illustration',
           'skill-illustration-wide', 'spell-illustration-wide', 'spell-illustration', 'system-asset')
);

create table public.arcane_system_assets (
  id uuid primary key,
  asset_key text not null unique check (asset_key in ('arcane-paper-doll-hexagon-base', 'arcane-portrait-stand')),
  label text not null,
  asset_path text,
  app_sha256 text,
  app_bytes integer,
  width integer,
  height integer,
  alpha_preserved boolean,
  constraint arcane_system_asset_identity check (
    (asset_key = 'arcane-paper-doll-hexagon-base' and id = '2ab9aa61-4b89-4d7f-8905-19ce644d9121') or
    (asset_key = 'arcane-portrait-stand' and id = '8aa5641c-f0d2-4f80-bf25-ff616dc2cdce')
  ),
  constraint arcane_system_asset_publication check (
    (asset_path is null and app_sha256 is null and app_bytes is null and width is null and height is null and alpha_preserved is null)
    or (
      asset_path is not null and app_sha256 is not null and app_bytes is not null and
      width is not null and height is not null and alpha_preserved is true and
      app_sha256 ~ '^[a-f0-9]{64}$' and app_bytes between 1 and 500000 and
      asset_path = 'hermes/system-asset/' || asset_key || '/' || app_sha256 || '.webp' and
      ((asset_key = 'arcane-paper-doll-hexagon-base' and width = 1220 and height = 811) or
       (asset_key = 'arcane-portrait-stand' and width = 1067 and height = 1280))
    )
  )
);
alter table public.arcane_system_assets enable row level security;
-- Explicit privileges also override Supabase's default privileges for new tables.
revoke all on public.arcane_system_assets from public, anon, authenticated, service_role;
grant select on public.arcane_system_assets to authenticated, service_role;
grant update (asset_path, app_sha256, app_bytes, width, height, alpha_preserved)
  on public.arcane_system_assets to service_role;
create policy arcane_system_assets_published_read on public.arcane_system_assets
  for select to authenticated using (asset_path is not null);

insert into public.arcane_system_assets (id, asset_key, label) values
  ('2ab9aa61-4b89-4d7f-8905-19ce644d9121', 'arcane-paper-doll-hexagon-base', 'Arcane Bronze Ivory Hexagon'),
  ('8aa5641c-f0d2-4f80-bf25-ff616dc2cdce', 'arcane-portrait-stand', 'Arcane Portrait Stand – Master 01');
comment on table public.arcane_system_assets is
  'Shared Arcane Paper Doll system WebP pointers; source/archive provenance remains in hermes_jobs.';
