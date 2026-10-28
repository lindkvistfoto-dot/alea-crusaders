# HERMES CORE – Trophy Room publication targets

## Scope
Extend the existing developer GitHub Actions publisher (PR #331) to support the two existing Trophy Room tables without adding a second pipeline. Keep the current system-image path unchanged.

| Target | Existing table | Purpose |
| --- | --- | --- |
| system | arcane_system_assets | System frames and backgrounds (existing) |
| honor-definition | honor_definitions | Main award, badge, and medal image |
| honor-relief | honor_relief_variants | Enamel, metal relief, carved wood and other variants |

## Mandatory implementation contract
1. Introduce an explicit, versioned target discriminator in queue JSON. Preserve backward compatibility with existing `schema:1` system requests.
2. Restrict new target IDs to UUIDs and verify the referenced row exists and belongs to an authorized Trophy Room honor. Do not create duplicate honors or relief variants automatically.
3. Verify Inbox and archive are **separate** Drive objects containing identical SHA-256 bytes. The Trophy Room default archive folder is `02 – ORIGINALARKIV` (`1vPZsU1q371IL4wr6CeDcefjENUDRlAq-`), until a dedicated folder is approved.
4. Preserve source bytes; create a WebP with alpha preserved, verify WebP SHA-256 by Storage download and public readback.
5. Activate only the selected image target using optimistic concurrency (image_revision and previous pointer). A failed upload or concurrent edit must leave the previous image unchanged.
6. Confirm the actual foreign-key semantics of `image_asset_id` on `honor_definitions` and `honor_relief_variants` before implementation. **Never** write a Storage path into a UUID/reference column. Reuse the existing image registry and registration path.
7. Ensure retries are idempotent, with no duplicate image variants or unintended active-variant changes.
8. Preserve `arcane_system_assets` functionality and HERMES ALEA's independent web-user workflow.
9. Implement automated tests for system regression, honor-definition CREATE/REPLACE, relief CREATE/REPLACE, wrong archive folder, mismatched hash, missing row, stale revision, duplicate/retry, and failed Storage readback.
10. Run a real end-to-end test for Perfektionisten's enamel variant; verify the rendered image in Honors admin and Trophy Room before operational signoff.

## Live pilot already staged
- Honor: `Perfektionisten`, `honor_definitions.id = 6a67121d-67ee-4943-82a3-83a15334d815`.
- Inbox original Drive ID: `1G9gmHbZtrIEH7mQb-cXgRn1oi17dkLk_`.
- Archive original Drive ID: `1TTlxObS_k6EPFEbS-XtuYY5NcYJSWHxW`.
- Original SHA-256: MUST be calculated from downloaded Inbox and archive bytes before creating the queue request; no unverified digest may be used.
- Material: enamel.
- IMPORTANT: select/confirm the intended existing `honor_relief_variants.id` before publishing. No blind update.

## Definition of done
The same queue/publisher pipeline safely supports system, honor-definition and honor-relief targets; test suite passes; Perfektionisten is actually published, linked, and visible. A document or green unit tests alone are not completion.

## Safe rollout and rollback (mandatory)
- Ship the queue target parser and tests first, without modifying the production system publisher.
- New schema-2 honor targets must be gated behind an explicit opt-in feature flag in the GitHub Actions publisher; **default OFF** until an end-to-end staging test is signed off. Schema-1 system publishing must remain unchanged.
- Before any activation, record the target row ID, old image_asset_id, old image_revision, old published_variant_id (if relevant), and newly created image registry ID. Never log credentials.
- On failed validation or publication, do not update the target pointer. Preserve Drive originals and any previously published WebP.
- To roll back: disable the honor-target feature flag first, then restore the prior image pointer through a revision-checked, authorized operation. Do not delete original files, published WebP or image registry history.
- Only after a verified Perfektionisten pilot should the honor target gate be enabled for routine production.
- Do not merge the implementation solely because unit tests pass. A missing authenticated database schema inspection or a missing image registry contract is a blocker.
