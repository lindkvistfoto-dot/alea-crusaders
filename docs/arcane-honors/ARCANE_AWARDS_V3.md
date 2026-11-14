# ARCANE AWARDS V3

## Fixed frame assets

Award administration and the Trophy Room resolve every award tier through the shared `ArcaneAwardRenderer` mapping. Per-award `badge_frame_assets` values are ignored for awards; they remain stored for compatibility and are not edited by the award form.

| Tier | Asset key | DEV path | SHA-256 |
|---|---|---|---|
| Bronze | `arcane-award-frame-bronze` | `hermes/system-asset/arcane-award-frame-bronze/a66f6d01b25777dbd2c761606ffb8f6e87f822e0752a9287711dbd3921a61d3c.webp` | `a66f6d01b25777dbd2c761606ffb8f6e87f822e0752a9287711dbd3921a61d3c` |
| Silver | `arcane-award-frame-silver` | `hermes/system-asset/arcane-award-frame-silver/2a8cbbfea7707cc3dafb364792c5b865fddfbbc07ae78db38938b0e99bf823a8.webp` | `2a8cbbfea7707cc3dafb364792c5b865fddfbbc07ae78db38938b0e99bf823a8` |
| Gold | `arcane-award-frame-gold` | `hermes/system-asset/arcane-award-frame-gold/aafb0d8223b4a158131e443a253b399e8a1c9e730cbb36d181bfcb26516a5c0a.webp` | `aafb0d8223b4a158131e443a253b399e8a1c9e730cbb36d181bfcb26516a5c0a` |

All three DEV records are 2048 × 2048. The LIVE Supabase project was queried during this change: these three keys were not present in `arcane_system_assets` or `storage.objects`. LIVE currently contains the older `arcane-laurel-badge-{bronze,silver,gold}` assets, which are portrait 592 × 887 images and are deliberately not substituted. The development preview can verify the new UI and mapping against DEV, but production asset availability remains to be reconciled before a future LIVE release.

## Data and upload behavior

- `honor_definitions.image_asset_id` remains the single active award motif pointer.
- Existing definitions and `honor_grants` are unchanged. No schema migration is required.
- `honor_grants` has no award-tier field or structured criteria evaluator. The current Trophy Room therefore retains its bronze fallback and assignment-count marker; this change does not invent tier thresholds or alter grant history.
- Award image upload and replacement continue through the existing HERMES ALEA `definition` target. Activation updates the reference only after upload verification succeeds; a failed upload leaves the old reference intact.
- Existing relief rows and legacy frame metadata are retained in storage. They are not exposed as award configuration and are not deleted by this change.
- No database migration or asset deletion is included.
