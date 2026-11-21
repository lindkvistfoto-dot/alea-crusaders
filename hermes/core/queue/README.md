# HERMES CORE developer requests

HERMES CORE is the single Drive-backed publication path for images created or supplied by ChatGPT, Work and Codex. HERMES ALEA remains independent and handles direct end-user uploads from ALEA Pages.

Each developer request preserves the exact original in the configured Drive Inbox and a separate archive copy. The queue contains metadata only; it never contains image bytes, credentials, database names or Storage destinations.

## Request formats

Schema 1 remains supported for existing system-image requests. Schema 2 remains supported for honors and the existing named application targets.

Schema 3 selects a repository-owned image profile:

```json
{
  "schema": 3,
  "label": "Private portrait",
  "target": {
    "kind": "profile",
    "profile_id": "npc-portrait-private",
    "id": "existing-npc-key"
  },
  "drive_file_id": "INBOX_DRIVE_FILE_ID",
  "archive_file_id": "ARCHIVE_DRIVE_FILE_ID",
  "source_sha256": "SHA256_OF_ORIGINAL_BYTES"
}
```

The trusted [CORE image contract](../../../features/hermes-core/contract.json) lists the available profiles and binds each profile to its processing rules and server-side adapter. For a new DEV campaign map under an existing place, follow the [campaign map procedure](../../../features/hermes-core/OPERATIONAL_ACCEPTANCE.md#new-campaign-map-in-dev).

A request may select a profile and an existing target key. Any caller-supplied bucket, table, column, path or SQL identifier is ignored; the publisher resolves these only from the checked-in contract. Unknown profiles, profile/target mismatches and missing target rows fail closed. Do not create a new publisher or workflow to add a profile.

## Storage and readback

The publisher validates that Inbox and archive IDs are distinct, belong to their configured folders, and contain bytes matching the declared SHA-256. It applies the selected profile, writes an immutable SHA-addressed WebP to the profile's approved bucket, and verifies Storage readback. Public profiles are checked through public readback; private profiles use a short-lived signed readback. The database adapter updates only the selected image pointer, preserves profile metadata where configured, and verifies the target after activation.

The publisher never accepts client-selected storage or database destinations. It does not delete originals or prior published objects. Profile adapters that cannot safely preserve the current target's semantics remain unconnected until their adapter is implemented and verified.

DEV submissions use `hermes/core/queue/dev/<request>.json` on `development` and run [HERMES CORE – DEV image publication](../../../.github/workflows/hermes-core-publish-dev.yml). The top-level queue is for LIVE on `main`.

Use the repository Actions runs endpoint with `event=push&head_sha=<queue-commit-sha>` to find the matching run. Read its `publish` job and require a successful `HERMES_CORE_ACTIVE` record with the expected target and image reference.
