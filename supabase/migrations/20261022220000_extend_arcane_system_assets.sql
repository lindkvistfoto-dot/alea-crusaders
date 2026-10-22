-- Extend the existing MINOTAURUS-published system asset registry to cover the
-- complete allowlist in config/hermes-system-assets.json.
alter table public.arcane_system_assets
  drop constraint arcane_system_assets_asset_key_check,
  drop constraint arcane_system_asset_identity,
  drop constraint arcane_system_asset_publication;

alter table public.arcane_system_assets
  add constraint arcane_system_assets_asset_key_check check (asset_key in (
    'arcane-paper-doll-hexagon-base',
    'arcane-portrait-stand',
    'arcane-portrait-stand-generic',
    'arcane-bronze-ivory-pointed-hex-high-angle',
    'arcane-bronze-ivory-pointed-hex-low-angle'
  )),
  add constraint arcane_system_asset_identity check (
    (asset_key = 'arcane-paper-doll-hexagon-base' and id = '2ab9aa61-4b89-4d7f-8905-19ce644d9121') or
    (asset_key = 'arcane-portrait-stand' and id = '8aa5641c-f0d2-4f80-bf25-ff616dc2cdce') or
    (asset_key = 'arcane-portrait-stand-generic' and id = 'd6ad2f3e-70a6-4c2a-89be-9b02b9fd27e8') or
    (asset_key = 'arcane-bronze-ivory-pointed-hex-high-angle' and id = 'b8131d52-a0c8-46a1-9bb8-9f6225b8c0a1') or
    (asset_key = 'arcane-bronze-ivory-pointed-hex-low-angle' and id = '39c5d2f1-7a65-47f0-bd21-5ce7d61d81e3')
  ),
  add constraint arcane_system_asset_publication check (
    (asset_path is null and app_sha256 is null and app_bytes is null and width is null and height is null and alpha_preserved is null)
    or (
      asset_path is not null and app_sha256 is not null and app_bytes is not null and
      width is not null and height is not null and alpha_preserved is true and
      app_sha256 ~ '^[a-f0-9]{64}$' and app_bytes between 1 and 500000 and
      asset_path = 'hermes/system-asset/' || asset_key || '/' || app_sha256 || '.webp' and
      (
        (asset_key = 'arcane-paper-doll-hexagon-base' and width = 1220 and height = 811) or
        (asset_key = 'arcane-portrait-stand' and width = 1067 and height = 1280) or
        (asset_key = 'arcane-portrait-stand-generic' and width = 853 and height = 1280) or
        (asset_key = 'arcane-bronze-ivory-pointed-hex-high-angle' and width = 1280 and height = 1170) or
        (asset_key = 'arcane-bronze-ivory-pointed-hex-low-angle' and width = 1280 and height = 853)
      )
    )
  );

insert into public.arcane_system_assets (id, asset_key, label) values
  ('d6ad2f3e-70a6-4c2a-89be-9b02b9fd27e8', 'arcane-portrait-stand-generic', 'Arcane Portrait Stand – Generic Battle Pose'),
  ('b8131d52-a0c8-46a1-9bb8-9f6225b8c0a1', 'arcane-bronze-ivory-pointed-hex-high-angle', 'Arcane Bronze Ivory – Pointed Hex High Angle'),
  ('39c5d2f1-7a65-47f0-bd21-5ce7d61d81e3', 'arcane-bronze-ivory-pointed-hex-low-angle', 'Arcane Bronze Ivory – Pointed Hex Low Angle')
on conflict (id) do nothing;
