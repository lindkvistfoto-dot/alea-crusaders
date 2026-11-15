# ARCANE AWARDS V3

## Fixed frame assets

Award administration and the Trophy Room resolve every award tier through the shared `ArcaneAwardRenderer` mapping. Per-award `badge_frame_assets` values are ignored for awards; they remain stored for compatibility and are not edited by the award form.

| Tier | Asset key | DEV path | LIVE path | SHA-256 |
|---|---|---|---|
| Bronze | `arcane-award-frame-bronze` | `hermes/system-asset/arcane-award-frame-bronze/a66f6d01b25777dbd2c761606ffb8f6e87f822e0752a9287711dbd3921a61d3c.webp` | `hermes/system-asset/arcane-award-frame-bronze/a66f6d01b25777dbd2c761606ffb8f6e87f822e0752a9287711dbd3921a61d3c.webp` | `a66f6d01b25777dbd2c761606ffb8f6e87f822e0752a9287711dbd3921a61d3c` |
| Silver | `arcane-award-frame-silver` | `hermes/system-asset/arcane-award-frame-silver/2a8cbbfea7707cc3dafb364792c5b865fddfbbc07ae78db38938b0e99bf823a8.webp` | `hermes/system-asset/arcane-award-frame-silver/2a8cbbfea7707cc3dafb364792c5b865fddfbbc07ae78db38938b0e99bf823a8.webp` | `2a8cbbfea7707cc3dafb364792c5b865fddfbbc07ae78db38938b0e99bf823a8` |
| Gold | `arcane-award-frame-gold` | `hermes/system-asset/arcane-award-frame-gold/aafb0d8223b4a158131e443a253b399e8a1c9e730cbb36d181bfcb26516a5c0a.webp` | `hermes/system-asset/arcane-award-frame-gold/aafb0d8223b4a158131e443a253b399e8a1c9e730cbb36d181bfcb26516a5c0a.webp` | `aafb0d8223b4a158131e443a253b399e8a1c9e730cbb36d181bfcb26516a5c0a` |

All three records are 2048 × 2048 and preserve true alpha. The fixed assets have now been published to LIVE through HERMES CORE and read back from the LIVE `arcane_system_assets` registry. The public asset paths are the same in DEV and LIVE because both environments use the same verified originals and content hashes. The legacy `arcane-laurel-badge-{bronze,silver,gold}` portrait assets are not used as award frames.

## Data and upload behavior

- `honor_definitions.image_asset_id` remains the single active award motif pointer.
- Existing definitions and `honor_grants` are unchanged. No schema migration is required.
- Award tier criteria and tier assignment are deferred to the next phase. This change does not invent thresholds, add a tier field, or alter grant history; existing highest-tier/count display behavior is preserved.
- Award image upload and replacement continue through the existing HERMES ALEA `definition` target. Activation updates the reference only after upload verification succeeds; a failed upload leaves the old reference intact.
- Existing relief rows and legacy frame metadata are retained in storage. They are not exposed as award configuration and are not deleted by this change.
- No database migration or asset deletion is included. HERMES CORE created the three missing LIVE registry rows and immutable Storage objects; it changed no grant, definition, or history rows.

## Shared award mounting

The same `ArcaneAwardRenderer` mount is used in administration previews and the Trophy Room. The motif is inset to 80% of the frame diameter; the fixed colored diamond and round gem assets sit above the motif and below the frame. A tinted crown background is aligned beneath the round gem. New HERMES ALEA award uploads are color-sampled in the browser, mapped to the existing accent palette, and saved in the existing `badge_frame_assets.accent_color` JSON metadata. No award-specific image controls or schema changes are added.

The existing HERMES CORE DEV gem family is resolved by these asset key patterns:

- `arcane-award-gem-diamond-{red,blue,green,yellow,orange,purple,pink,turquoise,cyan,black,white,brown,light-gray,dark-gray,amber}`
- `arcane-award-gem-round-{red,blue,green,yellow,orange,purple,pink,turquoise,cyan,black,white,brown,light-gray,dark-gray,amber}`

Gem originals and color variants are already registered in DEV. The crown fill is a small CSS layer beneath the round gem asset, not a separate image file. This visual correction does not publish additional assets to LIVE.
