# HERMES Inbox Bridge – symbol artwork

This document describes the first application of the reusable HERMES asset intake. It is scoped to the five symbol image types and is stacked on pull request #261.

## Flow

1. The administrator chooses an image and presses **Spara bild** in symbol administration.
2. The authenticated Edge Function checks the administrator flag, target symbol, MIME signature, size, SHA-256 and idempotency key.
3. It stores the exact original bytes in the existing private `alea-hermes-source` bucket and creates a durable `hermes_asset_jobs` row. A successful response means **Mottagen**, not published.
4. The scheduled GitHub Actions worker uses the existing HERMES OAuth and Supabase secrets. It uploads the original to the configured Drive Inbox, reads it back and verifies SHA-256.
5. It copies the Inbox original into the type-specific Drive original archive, reads that copy back and verifies its parent folder and SHA-256.
6. It validates and converts the original to immutable WebP, uploads it to `alea-hermes-public`, then reads back and verifies the published bytes.
7. Only then does it update the symbol image field with a compare-and-set against the path that was active when the job was received. A changed pointer stops activation and leaves the newer image active.

The existing battle-pose worker remains unchanged. Its production jobs use private staging → archive → WebP; they do not use Drive Inbox. This bridge adds Inbox explicitly.

## Security and boundaries

- The browser sends the user's session token and the existing publishable key. It never receives a service-role key, Drive OAuth token or GitHub secret.
- The Edge Function checks the same signed-in user's admin profile before accepting an upload or retry.
- Originals stay in the existing private staging bucket and are not added to Git.
- The worker reuses the existing HERMES OAuth and Supabase Actions secrets. It does not change service-account WIF or its trust.
- The Drive Inbox and archive IDs are existing repository configuration. The worker fails closed if it cannot verify the expected folder and bytes.
- Production Edge Function deployment, migration application, live upload and image-reference activation are separate enablement steps. The live pilot remains behind Daniel's explicit approval.

## Job statuses and recovery

- `received`: original and durable job receipt are stored in private staging.
- `inboxed`: Drive Inbox original was read back and hash verified.
- `archived`: permanent archive copy was read back and hash verified.
- `publishing`: immutable WebP publication is underway; the active pointer is still unchanged.
- `published`: WebP readback and pointer readback succeeded.
- `failed`: error is retained on the job. Temporary errors receive exponential retry scheduling (bounded to one hour; worker scans every five minutes). Integrity, format and target-conflict errors stop automatic retry. Jobs are not deleted.
- After 12 attempts, an administrator can use **Försök igen**. The worker resumes from the last verified Drive file, and deterministic names plus hashes make repeat steps idempotent.

The staging original is retained after publication so a failed or interrupted run can be recovered without asking the administrator to re-upload. The previous image path remains active until all verification gates pass.

## Symbol image profiles

| UI choice | HERMES kind | Database field | Archive |
|---|---|---|---|
| Ikon | `symbol` | `icon_path` | Symbol icon |
| Effektbild | `symbol-effect` | `effect_image_path` | Square illustration |
| Cutout | `symbol-cutout` | `cutout_path` | Cutout |
| Illustration 1:1 | `symbol-illustration` | `illustration_path` | Square illustration |
| Illustration Wide 16:9 | `symbol-illustration-wide` | `illustration_wide_path` | Wide illustration |

Square profiles produce 640×640 WebP; wide produces 1280×720 WebP. Icons and cutouts preserve transparency. Cutouts require fully transparent pixels. Wide sources must be 16:9.

## Verification boundary

Automated worker tests use mocked Drive, Storage and database boundaries. They prove local validation, stage ordering, retry classification, idempotent completion and compare-and-set behavior. They do not prove production OAuth folder access or make production writes.

The isolated production pilot must verify one disposable symbol slot and a restorable prior value. It must confirm Inbox original readback, archive original readback, WebP readback/hash and successful pointer rollback. Do not run it until Daniel approves.

## Next image types

After the symbol pilot, the worker can gain small adapters for ordinary spell art and skill art. Character portraits, weapons and equipment can follow by adding explicit table/field/profile adapters one group at a time. They are not enabled by this change.
