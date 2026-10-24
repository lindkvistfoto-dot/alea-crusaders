-- Permit the exact locked opaque 16:9 Trophy Room system scene.
-- Existing row security and publication privileges remain unchanged.
alter table public.arcane_system_assets
  drop constraint if exists arcane_system_assets_asset_key_check,
  drop constraint if exists arcane_system_asset_key_format,
  drop constraint if exists arcane_system_asset_identity,
  drop constraint if exists arcane_system_asset_publication;

alter table public.arcane_system_assets
  add constraint arcane_system_assets_asset_key_check
    check (asset_key ~ '^arcane-[a-z0-9]+(-[a-z0-9]+)*$' or asset_key = 'arcane-trophy-room-v2.2'),
  add constraint arcane_system_asset_publication check (
    (asset_path is null and app_sha256 is null and app_bytes is null and width is null and height is null and alpha_preserved is null)
    or (asset_path is not null and app_sha256 ~ '^[a-f0-9]{64}$'
      and app_bytes between 1 and 500000
      and width between 1 and 4096 and height between 1 and 4096
      and (alpha_preserved is true or (asset_key = 'arcane-trophy-room-v2.2' and alpha_preserved is false and width = 1280 and height = 720))
      and asset_path = 'hermes/system-asset/' || asset_key || '/' || app_sha256 || '.webp')
  );
