# HERMES CORE – operational acceptance (Trophy Room)

This is the acceptance contract, not a new feature roadmap. Do not mark CORE operational solely because CI passes.

## Existing implemented pieces
- Drive original archive adapter and verified Drive-file reuse.
- Browser WebP conversion and existing WebP passthrough in publish-from-drive.
- Authenticated Supabase Storage upload, readback SHA-256 and public URL SHA-256.
- System image CREATE, READ, REPLACE and detach RPCs.
- Isolated system-image path `hermes/system-asset/<asset_key>/<sha256>.webp`.

## Remaining integration before production acceptance
1. **Host invocation**: expose `createArchivedSystemPublisher` to an authorized runtime with a real Drive binary downloader and authenticated Supabase client. Neither GitHub merge nor a browser import supplies these credentials automatically.
2. **All Trophy Room targets**: wire honor_definitions and honor_relief_variants (including award, badge, medal and variant images) to existing authorized server-side image updates. Current publish-from-drive targets system images only; do not silently redirect other categories to system assets.
3. **Drive fallback**: verify the private-original handoff matches the existing HERMES ALEA worker job schema and that retry succeeds after Drive failure. Do not introduce a second worker.
4. **Frame image fidelity**: browser canvas encoding with quality 0.92 is not guaranteed lossless. For approved frames, use an already prepared lossless WebP or a verified lossless encoder and compare visual/alpha results.
5. **Actual ALEA rendering**: verify the Trophy Room reads the new asset key and displays the intended frame, rather than only confirming a Storage object.
6. **Real end-to-end run**: CREATE `arcane-lion-badge-gold` from archived original Drive file `1Qu2LyjKZxLNKXty5BJNk4VeD0htiQRdV`, then test REPLACE and DELETE with separate disposable assets.

## Acceptance evidence
- Drive original ID and confirmed archive location.
- SHA-256 and byte size for the actual published WebP.
- Supabase bucket/path and successful readback.
- Database image key and revision.
- Visible image in Trophy Room.
- Successful CREATE, REPLACE and DELETE tests; previous image preserved on failed publication.
- No changes to existing Laurel badge frames.

## Scope discipline
No new functional restrictions, workers, or administrative flows without owner approval.
