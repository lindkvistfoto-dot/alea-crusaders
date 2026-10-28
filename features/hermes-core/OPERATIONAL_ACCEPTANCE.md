# HERMES CORE – developer publishing

HERMES CORE is the standard image publication flow for **ChatGPT, Work and Codex**. HERMES ALEA remains the independent web-user flow.

1. Read `config/hermes-drive-folders.json` and `config/hermes-system-assets.json` from `main`; never guess folder IDs.
2. Upload the exact original to `inbox_folder_id` and copy it to its configured archive. System images use their per-asset archive setting; honor targets use `folders.original_archive`.
3. Verify distinct Drive file IDs and identical SHA-256 bytes. Preserve both originals.
4. Push one request to `hermes/core/queue/`, using the [queue contract](../../hermes/core/queue/README.md).
5. Actions verifies Drive files, converts to WebP, uploads to `alea-hermes-public` without overwrite and verifies both Storage and public readback hashes.
6. Register image metadata, switch only the selected target with revision/pointer comparison, and read the target back. Report success only after the corresponding Actions run succeeds and the intended reference resolves.

| Queue target | Destination |
| --- | --- |
| `system` (schema 1 or 2) | `arcane_system_assets.asset_path` |
| `honor-definition` (schema 2) | `honor_definitions.image_asset_id` |
| `honor-relief` (schema 2) | `honor_relief_variants.image_asset_id` |

Honor `image_asset_id` is **text matching `arcane_system_assets.asset_key`**, not a UUID and not a Storage path. Verify against the live schema and `features/honors/honors-image-resolver.js`. A relief image attachment does not change the honor's selected variant or draft/active status.

The trusted publisher uses existing credentials and read-only Drive WIF. Registry INSERT grants cover only `id,asset_key,label`; verified metadata is written by UPDATE. The honor adapter requires the narrow `UPDATE(image_asset_id)` grants in `hermes_core_honor_image_grants`. RLS, browser grants and unrelated fields remain unchanged. Do not add credentials or change permissions during an ordinary image submission.

Requests for unconnected targets must identify the missing adapter explicitly; never redirect them into a different table or folder. The historical HERMES 4 queue is not a fallback for CORE failures.
