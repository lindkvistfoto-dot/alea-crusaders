# HERMES ALEA staging recovery

Parent task: armor PR #721. DEV baseline: `0a2901d6`.

## Confirmed causes

- Five retained sources reserved 60,000,000 bytes despite four activated originals totaling only 8,331,593 bytes. A pending abandoned upload reserved another 12,000,000 bytes.
- The scheduled workflow on main runs the development worker with cleanup flags but omits HERMES_ALEA_CLEANUP_APPROVED. Run 42905237137, DEV job 130141392158, stopped with CLEANUP_NOT_APPROVED before processing anything.
- Development's retention-only cleanup never initialized the Drive folder/token required by verify_archive.
- Archive authentication currently depends on an existing user OAuth connection. The scheduled LIVE run also failed HTTP 400 at Google's token endpoint. DEV archival jobs remain queued.
- PR #705 proposes service-account writes to a personal My Drive folder. The verified archive folder is personally owned and the service account is a reader. Google documents that service accounts cannot own Drive files and have no storage quota; simply granting writer does not make this an operational replacement for user-authorized archival. PR #705 remains untouched/unmerged.

## Repairs

1. Keep the full 12 MB reservation for unfinished uploads. Once activation has already checked source_bytes against immutable Storage metadata, retain only the actual verified source size. Keep limits, pending-job count, locking, idempotency and retention unchanged. No deletion or target-pointer change.
2. Initialize the existing retention worker's Drive read access using CORE's existing WIF identity and its current reader permission, with drive.readonly. No permission expansion or extra publisher.
3. If archive authentication fails, retain originals and report failure, but still execute independently eligible abandoned-job cleanup. Do not claim/archive jobs without authentication or run retention deletion without fresh Drive readback.
4. Run the same existing cleanup job once on push to the scoped repair branch. LIVE jobs remain excluded. The repair trigger does not create a second queue or publisher.

## DEV verification

- Actual DEV transaction: a new armor_head intent was accepted, a caller-declared 1-byte source still reserved exactly 12 MB while unfinished, and all test writes were rolled back.
- Migration applied only in DEV as 20261110235729_hermes_alea_release_activated_reservation.sql. Readback reservation: 20,331,593 bytes; configured user limit remains 60,000,000.
- Existing worker Python suite: 18 tests pass. Existing focused ALEA suites and repository CI are used; no new permanent test/control is added.
- All original files and existing image pointers were preserved by the quota repair.

## Operational follow-up

The scheduler definition on main must receive the DEV cleanup invocation/approval and Drive-read initialization. That operational workflow repair must preserve the LIVE job. User-authorized Drive archival still needs a working user connection for this personal archive; service-account ownership is not a valid shortcut.

## Real recovery run and second browser attempt

Run 42927653796 executed the existing cleanup worker from the repair branch.
The old weapon job 5712fecc-d95f-4cba-b583-d9cd97fb4ffd became abandoned;
both of its staging objects were deleted with the existing hash/readback path.
WIF correctly denied the untrusted repair branch (attribute condition). The
worker still completed abandoned recovery, skipped archive retention and
reported failure. No WIF trust expansion was requested or performed.

The Cloudflare test then passed the quota gate and uploaded the original and
WebP to a new armor_head job e23a0b11-beec-4a55-9de8-79d3618b0c73. The next
failure was the existing verifier CORS list: Supabase logged OPTIONS 403.
Replace two per-PR hostname exceptions with the DEV project's own Cloudflare
Pages hostname family; authentication and target permission remain unchanged.
The existing DEV verifier deployment workflow is also scoped to this repair
branch so the unchanged packaging/deployment path can verify the repair before
merge. No public bucket, new verifier or arbitrary external origin is added.

Health reporting now uses the same verified-size reservation calculation as
begin; its additive migration is 20261111000131.
