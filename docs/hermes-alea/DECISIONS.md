# HERMES ALEA architecture decision

Baseline: main `0a569053bd763018ffcaf0e814dd5bf5ddf4ca58`, 26 October 2026.

## Phase 0 outcome: GO WITH CHANGES

Preserve CREATE/REPLACE/REMOVE, upload intent before bytes, immutable paths, atomic pointer/history/archive queue, revision CAS, retries and seven/thirty-day retention. Browser conversion performs no crop, background removal, compositing or image generation. Future reference-image templates are excluded.

The new instruction supersedes the earlier preference to extend hermes_web_jobs: production constraints require a pose FK, pose-specific paths and battle-pose bucket. Its worker also publishes only AFTER archive. Sharing that contract would couple the pilot to live pose processing. Use a separate `hermes_alea_jobs` operation ledger and private settings row. The ledger is not a general image registry: one operation owns one output; REMOVE records a detached reference. Separate buckets avoid changing the existing 512 KiB WebP bucket or PNG/WebP-only pose staging. Existing OAuth/Drive archive helpers may be reused without altering their pose entrypoint.

## ALEA-wide publishing standard

HERMES ALEA is the single standard publishing process for user- and administrator-initiated images anywhere in ALEA, regardless of screen or image type. Every target uses the same client, operation lifecycle, private staging/display buckets, Edge verification gate, activation/replace semantics, source archive and retention worker.

The common lifecycle is: validate against the target profile; convert to WebP in the browser; create the operation intent; upload original and display bytes to HERMES ALEA; verify the uploaded pair in the Edge verifier; finalize the managed asset pointer and revision; resolve the image through the shared HERMES ALEA asset resolver. Target-specific differences are limited to authorization, profile limits and the destination record/pointer.

New ALEA uploads must not be copied into a second legacy display bucket or published by a target-specific worker. Existing legacy paths may remain as read-only fallbacks for records that have not been republished. Where old consumers only understand a legacy path, adapt the shared resolver and those read paths so they can display managed HERMES ALEA assets; do not add a second write path.

If a target cannot follow this contract, stop and ask Zeus before introducing any exception. Profiles may express image constraints, but must not fork the publishing process.

## Pilot targets

| Target | Actual table/field | Existing permission | Profile |
|---|---|---|---|
| definition | honor_definitions.image_asset_id | admin, campaign GM, existing named global relief GM scope | honor-art-v1 |
| relief | honor_relief_variants.image_asset_id | corresponding definition manager | honor-relief-v1 |
| weapon | rule_weapons.image_asset_id | admin for write; authenticated ALEA users for active display read | weapon-art-v1 |
| armor_head / armor_arms / armor_torso / armor_legs | rule_armor_types.image_{zone}_asset_id | admin for write; authenticated ALEA users for active display read | DEFAULT_IMAGE_PROFILE |

Armor destination mapping and DEV evidence: [ARMOR_DEV_CANDIDATE.md](ARMOR_DEV_CANDIDATE.md). Each armor slot has an independent image_{zone}_revision.

Definitions cover category medal, award, badge. Reliefs retain preview/published selection. Shared Laurel/display frames, room scene, RP portraits, spell/skill art and other system assets remain outside the pilot. No fake arcane_system_assets registration: managed IDs use `hermes-alea:<job UUID>` and a safe display projection. Existing HERMES asset keys still resolve unchanged.

Use one additive image_revision column per target. A trigger increments revision for all image-key changes and blocks direct client assignment/removal of managed keys. Other metadata and legacy image editing retain existing RLS. Managed targets cannot be deleted until disconnected by REMOVE. Private, explicitly granted definer implementations check auth.uid and server-side manager scope; public RPC wrappers are invokers. No user_metadata authorization.

## Isolation and rollout

Database setting defaults disabled; browser controls appear only when capability RPC is enabled. Workflow has a separate enable variable, branch/main gate and concurrency group. No existing HERMES workflow or worker is modified. No production migrations, function deployment, data writes or merge are performed by this delivery.

Both buckets are private. The shared asset view exposes only safe display metadata: active weapon assets still referenced by rule_weapons are readable by authenticated ALEA users, while honor assets remain limited to their existing manager scope. Storage permits signed reads only for the active weapon display object (or the existing manager scope); original images stay private and uploader-scoped. No bucket is made public.

Full file decoding and alpha validation occur in an authenticated Edge verification function before a service-only verification receipt is recorded. Its pinned WASM dependency validates bytes; browser remains responsible for conversion. No additional hosted service is introduced. Jobs bind expected size/hash/MIME and server-generated paths; a forged client completion cannot activate unverified bytes.

## Retention and implementation boundary

Seven days starts at verified Drive readback; thirty days starts at latest detach event. Archive workers never write target pointers. Staging cleanup and WebP cleanup initially REPORT ONLY. A reservation protocol and retry-safe cleanup implementation are tested offline; its production execution remains disabled pending explicit approval. Unknown references, old assets and orphan uploads are report-only. Archive contains original bytes, not a guarantee of identical derived WebP restoration.

Profiles: static PNG/JPEG/WebP, <=12,000,000 source bytes, <=2048 each axis and <=4,194,304 pixels, WebP quality .92, no resizing. Relief requires true transparent pixels; honor art preserves alpha when present. These conservative V1 limits and quotas are explicit pilot defaults to validate against representative art before enabling.

Open PRs #271/#261 use archive-first symbol publication and are not dependencies; #189/#186 concern old pose recovery; #299/#301 concern existing display art/variant UI. Do not merge or overwrite their work. Existing PHOENIX HERMES V is a manual Drive adapter, not browser intake, and remains unchanged.

## Implementation refinements

Reserve the full 12 MB per source job when calculating staging quotas. Never trust a browser-declared small byte count to reserve capacity: Storage still caps every actual file at 12 MB and final verification checks exact bytes/hash. Unfinished uploads retain the full reservation. After activation has checked source_bytes against immutable Storage metadata, only that verified byte count remains charged until source cleanup is acknowledged.

Drive archive IDs are pre-generated and committed under the worker lease before file creation. All retries use the same file ID; a 409 is followed by folder/hash readback. This avoids depending on name-search visibility for duplicate prevention. See https://developers.google.com/workspace/drive/api/guides/create-file#generate-ids .

## Binding architecture lock

The ALEA user/admin publishing path is HERMES ALEA only. HERMES CORE remains the developer-initiated Drive-to-ALEA delivery system. Do not recreate HERMES 4.1 or its worker/OAuth publishing behavior.

Every ALEA consumer uses the common HERMES ALEA asset resolver for managed asset keys. Read compatibility for old `image_path` records is allowed, but is read-only; new uploads never write a legacy bucket or maintain a second pointer. Consumers and their shared access model must be adapted to private HERMES display assets.

Forbidden without Zeus's explicit approval: per-view publishers, upload routes outside HERMES ALEA, writes to legacy display buckets for new HERMES images, direct public Storage paths for new ALEA user images, local resolver implementations that bypass the common resolver, and any HERMES 4.1 equivalent.

The current CI workflow runs the repository's existing Vitest suites and build. If it does not enforce this contract, extend that existing required PR check with a narrowly scoped architecture guard. Documentation alone is not a merge-blocking lock. Branch/ruleset protection must also require the CI check on `development`; repository settings changes need repository administration access.
