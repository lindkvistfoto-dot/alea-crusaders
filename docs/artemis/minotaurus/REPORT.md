# MINOTAURUS — Issue #128 delivery

## Result

The original deletion commit removes 547 original files (546 PNGs + 1 ZIP; 1,549,957,260 bytes) and 18 quarantine files (14,155,998 bytes) from the current tree: **1,564,113,258 bytes / 1,564.11 MB** of original assets. Existing WebP files, UI manifests and production image pointers are retained. Main and Git history are unchanged until this PR is reviewed/merged; historical Git objects remain afterward.

Local full-tree checkout median: **7.6467 s before → 0.2775 s after** (3 fresh destinations each; existing local Git objects, no network). Measured tree size: 1,633,186,234 → 69,048,452 bytes. See `CHECKOUT.json` for exact samples and measured trees. This is filesystem checkout materialization, not a new GitHub Actions clone measurement. PR #113 records a historical ~117.4 s Actions transfer; no comparable new Actions transfer measurement is available yet.

## Direct publication

The existing Drive intake, Pillow 12.3.0 converter, Supabase client, buckets, job log and compare-and-set activation are reused. No new framework, credentials, bucket, database schema or RLS policy is introduced. PNG bytes are validated in memory and never emitted to Git or Supabase. Only optimized WebP and metadata leave conversion. Source SHA-256 is pinned in the queue instruction; manifest paths use stable `drive://<file-id>` provenance.

All eight existing HERMES 2.1 kinds retain their field/bucket routing, dimensions and transparency rules. Independent queue items continue after an item fails, with a failed final batch status. Source bucket uploads and the previous destructive public-illustration cleanup are removed. Already-active jobs only verify their existing WebP; historical provenance and active pointers are retained.

Pilot mode uses a separate content-addressed display path and performs Storage download, public/signed URL checksum verification and unchanged-target readback without writing jobs or target references. `docs/artemis/minotaurus/pilot-request.json` is the exact STOPP pilot instruction; it is deliberately outside the active queue so merging this PR cannot implicitly publish it.

## Evidence and remaining pilot work

- Real Drive STOPP original downloaded from the existing Inbox: Drive ID `1I6Wx2kTtVqN2l76cjwqvdOmN3_iLDY6C`, 2,678,163 PNG bytes, SHA-256 `bc00be5e732aca25b78a7ff7c8cdceed07f097e922da73c13bb44fc05e5b3e49`.
- Existing converter generated 167,144 WebP bytes, SHA-256 `de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170`, exactly matching the currently active STOPP content-addressed path. See `DRIVE_CONVERSION.json`.
- SQL readback at **2026-10-20 18:58:23 UTC**: `alea-hermes-source` **0 objects / 0 bytes**; active STOPP pointer unchanged.
- Existing `hermes-v2` Edge Function is now **version 10, ACTIVE, verify_jwt=true**. Deployed source readback confirms no `.upload(` and rejects every publication action except explicit legacy icon rollback. Existing admin authentication is retained. No production image reference was changed.
- Local tests exercise real conversion for all eight kinds; publisher tests execute the production publisher with mocked Storage/DB responses, testing isolated pilot writes, readback corruption, CAS conflict, already-active verification and rejected legacy/untrusted input. These are not live Storage upload evidence.

**Remaining live validation after manual merge:** run the new main-only Drive workflow once in `mode=pilot` with the committed STOPP instruction, using the existing Google WIF and `HERMES_SUPABASE_SERVICE_ROLE_KEY`; retain `HERMES_DIRECT_PILOT_VERIFIED`, confirm the isolated WebP by readback, and recheck source count 0 and unchanged active pointer. The new code has not been exercised in a live Storage upload run. The local executor has no usable publishing credentials/network path; terminal requests stalled and were abandoned. The configured main-only Actions identity is reused rather than widening WIF trust, adding a token or introducing a broker. Deno typecheck passed in [MINOTAURUS Actions run 39478636220](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39478636220); Deno is not installed locally. No new live publication success is claimed.

The completed code and deletions are ready for review. Because existing WIF is main-only, a reviewer may approve manual merge with the explicitly limited [post-merge STOPP pilot](POST_MERGE_PILOT.md) as the operational acceptance check. This is not a claim that live publication already passed. Production activation remains outside this pilot. No auto-merge.

## Removed dependencies and overlap

No runtime JS/HTML consumers of `assets/hermes/originals/` or `hermes/quarantine/` remain. The Drive intake no longer calls GitHub upload/dispatch; the publisher no longer fetches GitHub originals or reads/writes source Storage. The old HERMES 2.1, UI, legacy-reference and Gallery Kit publication workflows explicitly fail and have no PNG push trigger, so this deletion cannot start original publication. UI upload is staged for a separately reviewed Drive migration; existing optimized static UI is retained. Historical verification/archive tools and pure offline converter helpers still mention old paths for audit/restore; they are not active publication dependencies.

PR **#113** overlaps the old HERMES 2.1/UI checkout paths, source hydration and publisher fault isolation. MINOTAURUS supersedes its GitHub-source intake/hydration approach, incorporates blobless sparse checkout for Drive intake and independent batch failure handling, and removes the original consumer entirely. Do not merge #113 unchanged after this PR: close/supersede it or re-scope its remaining relevant measurements/tests after review. #113 is not edited or merged here.

PRs **#126 and #127 are untouched**, including their branches, configuration and data. `config/hermes-drive-folders.json` is unchanged. No Drive original or existing display asset was deleted. The 29 inherited CI failures were not investigated.

## Focused verification

- 54 JavaScript tests passed across 9 relevant files, including both gallery asset tests.
- 15 Python tests passed: 3 direct-flow tests, 2 Git regression guard tests, 10 existing HERMES conversion tests.
- Publisher and legacy Edge Function TypeScript syntax parsed locally; executable legacy rejection tests cover auth/method errors, PNG multipart rejection, import/retry 410 and diagnostics.
- Git diff whitespace check and proposed-tree original guard pass. CI repeats the focused regression suite; original-guard and Deno typecheck already passed remotely.

## Final verification follow-up

The initial full PR CI had the exact 29 documented baseline failure names plus two newly affected source-file assertions in `arcane-gallery-release-smoke.test.js` and `arcane-morph-art-assets.test.js`. These two assertions now verify retained WebP bytes against hashes, preserve source identities and ensure the retired Git original paths are absent. The 29 inherited failures were compared by name only, not investigated or modified. The targeted gallery checks are included in the MINOTAURUS guard. See `VERIFICATION.json`.

GitHub’s paginated PR file list confirms all 547 original-file paths and 18 quarantine paths. The deletion stays in its original single commit; this follow-up changes tests and documentation only. Existing WebP bytes and manifests are unchanged. Until manual merge, the retired GitHub workflows are changes in the PR; the legacy Supabase endpoint is already retired in deployed version 10.

Follow-up Actions head `bbd879092880ad9f5578002e549162140f02c3b1`: [full CI run 39479964505](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39479964505) now has exactly the documented **29 baseline failures / 1,271 passed tests**, with zero additional or missing failure names. [Gallery run 39479964425](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39479964425) passes all **89 Vitest checks**, then stops at browser startup with `CHROME_NOT_READY`; production build is consequently skipped there. That runner/browser blocker is recorded without further investigation. No full suite was run manually.

The original regression guard now uses `git diff --no-renames` so listing added/modified filenames cannot invoke rename-content matching against deleted originals in a partial clone. Both guard tests and the proposed-tree check pass locally. The publisher and deployed Edge source are unchanged since the successful Deno run.
