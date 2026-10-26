# HERMES ALEA pilot rollout

## Scope

Only `honor_definitions.image_asset_id` (medals, awards, badges) and `honor_relief_variants.image_asset_id` are managed. Room backgrounds, shared display/Laurel frames, RP portraits, spell art, battle poses and HERMES 4 stay on their existing paths. No existing media is migrated or deleted.

## Before enabling

1. Review the three stacked PRs in order: Core, Troférummet, Archive. Retarget later PRs after their bases merge. Do not enable production from an unreviewed branch.
2. Review and apply both additive migration files through the normal authorized migration process. This delivery did not apply them. Do not enable upload after only the first migration: archive intent and cleanup support are in the second.
3. Run `npm ci` and `node scripts/hermes-alea-prepare-edge.mjs` before bundling/deploying the new `hermes-alea` Edge Function. Its local WASM comes from the pinned npm lockfile and is included via `static_files`; no runtime CDN or original image is bundled. Keep JWT verification enabled.
4. Set `HERMES_ALEA_ALLOWED_ORIGINS` for the function to the exact existing Alea origins, comma separated. Supabase provides the normal server URL/anon/service env. Never put server secrets in browser code.
5. Configure `HERMES_ALEA_ARCHIVE_FOLDER_ID` on GitHub to an authorized original archive folder. Reuse the existing OAuth secrets and Supabase server secret; do not widen WIF. Confirm the OAuth identity can create, read and pre-generate binary file IDs. Do not assume old WIF readonly credentials can write.
6. Set GitHub variable `HERMES_ALEA_ENABLED=true` only after the schema/function prerequisites are ready. Its workflow runs on main at minutes 7,22,37,52. It does not modify active pointers.
7. Separately enable `private.hermes_alea_settings.enabled` for the approved isolated production pilot. Defaults: five pending jobs/user, 60 MB reserved staging/user, 1 GB total reserved staging; each source reserves 12 MB until cleanup is acknowledged. Set explicit reviewed values if these defaults are unsuitable.
8. Leave `cleanup_enabled=false`. The committed production workflow has no deletion flag or approval environment and therefore only reports candidates. A future explicit cleanup approval must cover both the database flag and the manual execution gate. Never run it merely to free quota without checking candidates.

All steps that write production configuration/schema/data require the existing explicit approval. No automatic merge, deployment or activation was performed.

## Live acceptance still required

With permission, create a new synthetic pilot honor rather than modifying an existing award. Verify CREATE, REPLACE and REMOVE through the actual logged-in interface; compare real original/staging/Drive SHA-256, observe immediate display while Actions is off, then enable archive and observe verified readback. Confirm unrelated honor assets and existing pose jobs are unchanged. A new upload may be limited by the conservative 2048 px profile: use prepared art, without automatic crop or background removal.

Full local tests and simulated/browser transport do not prove production RLS, gateway configuration or OAuth folder permissions. Keep PRs draft until CI and this acceptance plan are reviewed. A full live roundtrip is not claimed.

## Operations and recovery

- `hermes_alea_jobs` records upload and archive status; `hermes_alea_detach_events` exposes ERSATT/BORTTAGEN with prior path for managed files. Old asset keys remain recorded and are excluded from automatic cleanup.
- `hermes_alea_health()` is service-only: pending/attention counts, oldest pending job, last verified archive and reserved staging bytes. The worker logs this with cleanup/inventory counts, not private media bytes or URLs.
- Archive retry status is persistent. A job lease fences acknowledgements; pre-generated Drive ID is saved BEFORE upload, so retry after a lost reply uses the same ID. Ten failed attempts require operator action. An operator can requeue a reviewed failed job with its existing archive ID; never erase that ID to force a retry.
- Source cleanup starts seven days after archive verification. WebP cleanup starts thirty days after the latest detach and requires no live reference, archive readback and reservation. A reservation is never released after an uncertain DELETE; retry checks missing bytes and reconciles the acknowledgement.
- Orphans and abandoned uploads are review-only. The worker inventories both new buckets independently of job status. If quota fills due to abandoned jobs, review actual files and references before authorized removal/reconciliation; do not simply mark source_deleted_at while bytes remain.
- Turning the web pilot off hides new operation controls. Existing managed images still resolve for authorized Honors viewers. Archive work can continue. Stop the separate archive variable if that worker itself needs to be paused.
- REMOVE removes a field association; original archives remain. Exact deleted WebP bytes are not promised recoverable from a lossy original conversion. Permanent original-archive deletion and restore UI are outside V1.

## Reproduce verification

- `npm test -- --maxWorkers=1`
- `npm run build`
- `python3 -m unittest discover -s tests -p 'test_hermes_alea_worker.py' -v`
- `python3 -m unittest discover -s tests -p 'test_hermes_web_worker.py' -v`
- `python3 -m unittest discover -s tests -p 'test_hermes4*.py' -v`
- `node scripts/hermes-alea-browser-smoke.mjs` with Playwright installed. It starts its own local fixture server and uses synthetic alpha PNGs, real canvas/WebP and mocked backend transport at 1280/390 px. Optional `HERMES_ALEA_PLAYWRIGHT_MODULE` selects a module path; `HERMES_ALEA_CHROMIUM` selects a preinstalled binary; screenshots are opt-in through `HERMES_ALEA_SCREENSHOTS`.
- Deno typecheck: `deno check --config supabase/functions/hermes-alea/deno.json supabase/functions/hermes-alea/index.ts`. Offline local equivalent with installed dependency: `deno check --no-config --node-modules-dir=manual supabase/functions/hermes-alea/index.ts`.
