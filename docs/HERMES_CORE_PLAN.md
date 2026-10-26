# HERMES CORE — implementation plan

**Status:** plan only; no code, database, storage, credentials, or production settings changed.

## Goal

Provide the same simple image actions from ChatGPT, Work, and Codex:

- Upload a new image
- Replace an image
- Remove an image association

The original remains in the Google Drive archive when removed. Physical cleanup and archive deletion are later work.

## Boundary with HERMES ALEA

- HERMES ALEA continues to handle image actions that start in the Alea web application.
- HERMES CORE handles actions that start in ChatGPT, Work, or Codex.
- HERMES CORE does not change the Alea upload interface, its Edge function, its WASM verification path, its migrations, or its existing workers.
- Both entry points must update a medal or relief through the same managed target contract. CORE must not become a second independent writer to the Troférummet image fields.
- Existing HERMES 4 workflows and other image categories remain unchanged. Reuse only the existing image preparation and publishing code needed for this path.

## Proposed flow

1. The plugin action receives the supplied image and the selected Troférummet target.
2. It writes the original to the existing Drive Inbox and the permanent original archive.
3. A separate HERMES CORE job prepares the display WebP and publishes it to the existing approved Supabase destination.
4. After successful publication, one target update associates the new image with the selected medal or relief.
5. The Inbox copy is left for later cleanup. No cleanup worker is included in V1.

## Operation behavior

- **Upload:** publish the image, then attach it to the selected target.
- **Replace:** publish the new image first, then switch the target association. If publication fails, keep the old association.
- **Remove:** clear the target association and record `BORTTAGEN`. Keep the Drive original and published file. No physical deletion is part of V1.

## Scope and minimal safeguards

Pilot only the Troférummet medal/award material images and relief variants already represented by HERMES ALEA. Keep the four agreed material labels: enamel, metal relief, carved wood, and other; allow multiple images per award, with one active selection.

Use the existing target permissions and revision-aware update contract. The worker writes only the selected target field. The required file work is limited to reading the supplied bytes, preparing the WebP, and publishing it to the selected destination. No browser-side conversion or WASM dependency is added to CORE.

No new general-purpose asset registry, automatic retention policy, archive deletion, orphan cleanup, broad validation framework, or unrelated HERMES changes are included.

## Pilot and rollout

1. Confirm the exact target mapping and the shared target update operation against the current HERMES ALEA implementation.
2. Implement the plugin-origin adapter and worker on a separate branch. Keep all existing ALEA and HERMES 4 entry points unchanged.
3. Exercise upload, replace, and remove using a synthetic Troférummet test award. Confirm that a failed replacement leaves the old image active and that removal preserves the Drive original.
4. Review the pull request and its CI. Enable only the isolated pilot after Drive access and Supabase publication work through the actual connected credentials.
5. Expand beyond Troférummet only after the pilot is complete.

## Implementation boundary

The current HERMES ALEA design owns the Troférummet target fields and protects their updates. The existing HERMES 4 publisher does not directly provide the medal/relief create, replace, and remove contract. Therefore the first code change must be a narrow CORE adapter that uses the same managed target update contract; it must not write the fields directly or bypass HERMES ALEA. If that contract cannot be called without adding a second writer or changing the web/WASM path, stop before implementation and resolve the interface first.