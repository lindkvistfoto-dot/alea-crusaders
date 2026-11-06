# ALEA battle-pose integration – DEV implementation

## Scope and preserved behavior

Dockfabriken sends Pages uploads through the existing HERMES ALEA client, intents,
private original bucket, verifier and archive queue. It no longer creates new
`hermes_web_jobs`. CORE remains the Drive developer path. No new publisher, queue,
RLS policy, grant, secret or recurring test job is introduced.

Targets are `combatant-pose` and `race-pose`, restricted to the existing pose-admin
permission. New records are draft/inactive. Replacing an image does not change
pose identity, `publication_status`, `is_active`, base, mounting or equipment.

Original PNG/WebP: <=12 MB, <=2048 px, actual transparency. Browser conversion:
contain within 1280 px, no upscale/crop, WebP quality .85. The existing Edge codec
decodes both objects and checks hashes, dimensions and alpha. Edge writes the
verified WebP once to the existing `alea-hermes-public` SHA-addressed pose path,
then downloads and hashes those actual bytes before recording a service receipt.
Finalize requires that receipt and the public object's metadata before changing
the pointer. Honor upload behavior is unchanged.

The original and intermediate WebP retain the existing ALEA paths, allowing the
existing archive-only worker to use its fixed Drive-ID intent, lease and verified
readback without any new publisher. Pose originals/intermediates are excluded
from automatic cleanup candidates; public pose objects are never cleanup targets.
Archive status is separate from immediate publication; the private original stays
available while Drive archiving is pending or needs attention.

## Single writer and recovery

Begin locks the pose and reserves its existing `pending_staging_path`. It rejects
legacy claimed/queued targets and a second upload. CORE already guards that field
and refuses pending targets. A new `image_revision` trigger detects pointer ABA,
activation, pose identity and mounting changes. Finalize checks revision, previous
pointer and its own reservation, and clears only that reservation on success.

The client retains the original revision and idempotency fingerprint after a lost
response so retry resumes the same job. Interrupted original/WebP uploads are
write-once; duplicate responses proceed to actual byte verification. Failed
verification never updates the pose. A stale metadata conflict is not silently
rebased: retain the job/original and review it before any explicit cancellation
or reservation repair. Do not clear reservations or retry old jobs automatically.

## Verification and current gates

- DEV migration `20261105214447_hermes_alea_battle_pose_targets.sql` is applied to
  `wkiuyklzzroavclnsxna`; its filename matches deployed migration history.
- Local Postgres tests cover both target tables, concurrent intents, CORE's
  pending-path predicate, metadata conflicts, retained objects and unchanged state.
- Existing client/codec/profile/workshop tests and archive recovery tests reused.
  The verifier test uses real PNG/WebP bytes and rejects corrupt public readback.
- Build passes. No full new E2E/smoke suite and no MINOTAURUS changes.
- DEV and LIVE legacy job snapshots: six published records each; no queued,
  archiving, archived, optimizing or publishing jobs were found.
- **Actual authenticated DEV Pages upload and displayed-image acceptance remain
  unverified. Do not treat local fixtures as that acceptance.**
- The existing DEV Edge bundle could not be retrieved by the connected Supabase
  tool (`Failed to retrieve function bundle`). Local CLI deployment reports
  `AccessTokenRequiredError`; no CLI authentication is configured. The required
  local WASM binary must be bundled intact with the verifier; no runtime CDN or
  alternate conversion service is substituted.

## Complete DEV acceptance before any LIVE candidate

1. Deploy this branch's existing `hermes-alea` function to DEV with its pinned local
   WASM (`node scripts/hermes-alea-prepare-edge.mjs`). Keep JWT verification and
   existing origins/secrets. Do not widen any policy, grant or secret silently.
2. Use a logged-in ALEA DEV preview and an isolated inactive pose. Save a real
   transparent file through Dockfabriken. Record job ID, source/output hashes,
   private original bytes, public WebP bytes, pose reference and unchanged metadata.
3. Observe the saved public image in the ordinary workshop client, including image
   load success. Verify the original/archive status and a deliberate competing
   write. Reuse prior CORE transport evidence rather than run another CORE pilot.
4. Verify one original's existing ALEA archive flow through actual Drive readback.
   If that archive deployment is unavailable, keep the private original and report
   that gate; do not activate a new publisher.
5. Only then prepare an isolated LIVE candidate. Keep the five-minute worker active
   until separately approved LIVE transition and final pending-job readback.

## Retirement and rollback preparation

The retirement patch is intentionally not enabled in this PR. Once acceptance is
complete, replace only `hermes-web-intake.yml` triggers/delivery with a manual
exit-1 retirement notice. Preserve `hermes_web_worker.py`, all historical jobs,
Drive archives and objects. Never dispatch or requeue historical jobs as migration.

Rollback before merge: close this PR; the legacy worker remains unchanged. After
DEV deployment, revert the frontend/Edge to the recorded parent commit only after
reviewing pending ALEA pose intents. Keep the additive columns and history; do not
drop the tables/columns, delete objects or downgrade active pointers. Reservation
repair requires a concrete job-specific decision. A future LIVE rollback requires
separate Zeus approval. No main/LIVE changes are part of this DEV implementation.

**READY TO RETIRE HERMES 4.1 IN LIVE: NO until actual DEV acceptance above passes.**
