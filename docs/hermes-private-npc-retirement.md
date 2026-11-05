# Private NPC publisher retirement

Only `.github/workflows/hermes-npc-portraits.yml` is retired. Developer Drive deliveries use HERMES CORE; ALEA Pages uploads and existing authorization remain independent and unchanged.

## Verified replacement

- Legacy publisher: `scripts/hermes_npc_portraits.py`, global NPC lookup by `npc_key`, private `campaign-actor-images`, immutable `global-npc/{npc_key}/{sha256}.webp`.
- CORE profile `npc-portrait-private`: same bucket, lookup, path and JPEG portrait constraints. The fixed `npc-private-portrait` adapter preserves `image_reference` metadata and protects existing portrait pointers with compare-and-set; it does not create NPCs or reassign campaigns.
- Separate CORE campaign NPC/monster profiles use existing record UUIDs and campaign IDs read from their rows. The old workflow does not publish directly to campaign records.
- CORE verifies source/archive SHA-256, Storage download SHA-256 and private signed URL byte readback. Existing DEV run 41982522971 emitted verified campaign-npc-portrait and campaign-monster-portrait records (the overall run later failed on another target; these individual publications succeeded). Existing generic CORE LIVE run 42065036645 verifies LIVE transport. No new publication was started.
- Existing DEV test `tests/hermes-core-image-contract.test.mjs` covers private global NPC metadata/pointer behavior. Existing universal target tests cover campaign scope. These tests are reused, not duplicated.

## Read-only LIVE evidence, 2026-11-05

- Bucket `campaign-actor-images` is private.
- Four global NPC portrait references still match four retained Storage objects. No current campaign_npcs image_path uses the global-npc prefix; the existing copy RPC preserves image_path and source_global_npc_id.
- Effective RLS SELECT checked with transaction-local roles/claims: administrator sees four historical portrait objects; unrelated authenticated identity sees zero; anonymous sees zero. No roles, grants, policies or data were changed.
- `global_npc_portraits_select` allows admins/campaign GMs; `campaign_actor_images_select` preserves campaign role/player_visible rules. These authorize the existing signed Storage path. No new end-user signed URL was minted in this task; prior signed byte-readback evidence is reused.
- No legacy NPC Actions in queued/in_progress/waiting/requested status. The workflow has no separate persistent job queue; only explicit manifest changes/manual dispatch start it. Historical manifest and publisher script stay intact.
- No other workflow references the NPC workflow, portrait request folder or its dedicated publisher script.
- No originals, archived copies, Storage objects, NPC records, campaign records or historical job states are written or deleted.

## Proposed behavior

Remove legacy push triggers (main and the historical feature branch) and publication inputs/steps. Keep only workflow_dispatch with a clear exit-1 rejection, without checkout, authentication, credentials or publisher execution. CORE and all other publishers remain unchanged.

## Rollback

DEV baseline: 41e73aa72526d48fb01852376603251d75a267f3.
LIVE baseline: 85c21f243dbcfb6a7b0d86128406f696bf9cba81.

Only after a concrete need and separate Zeus approval, prepare a reviewed PR restoring the workflow from the relevant baseline. Do not restore or touch manifest files, retry historical runs, change job states or clean private Storage. Restoring only workflow configuration does not replay old manifest commits; new legacy publications still require a new matching push or explicit dispatch. Avoid simultaneous CORE and legacy submission for the same NPC.

Both prepared PRs remain unmerged. LIVE requires separate explicit approval. No MINOTAURUS infrastructure or new test suite is introduced; no measured 50% test-load reduction is claimed by this isolated change.
