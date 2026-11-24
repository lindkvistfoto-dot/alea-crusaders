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

The trusted [CORE image contract](../../features/hermes-core/contract.json) binds each profile to approved processing rules and a server-side adapter. Profiles currently cover unrestricted system assets, spell/skill/symbol icons and illustrations, honors/reliefs, and private NPC portraits. Profile rules preserve format, aspect, dimensions, alpha behavior, size budgets, archive location, Storage privacy and registered application references.

A request may select a profile and an existing target key. Any caller-supplied bucket, table, column, path or SQL identifier is ignored; the publisher resolves these only from the checked-in contract. Unknown profiles, profile/target mismatches and missing target rows fail closed. Do not create a new publisher or workflow to add a profile.

## Map objects for Kartakademin and the SL Control Board

Use schema 3 with profile `map-object`. This adapter stores a private immutable WebP and attaches it to the map library. Both collections use the same Swedish category names listed in [the map library guide](../../../docs/arcane-living-objects.md).

For a new object, choose one UUID for the template and keep it for retries. Put the display name in `label`. Set `object_template.campaign_id` to the resolved campaign UUID or explicitly to `null` for the shared collection. The optional measurements are in metres. Omit unknown measurements. An administrator can complete them in Objektverkstaden before placement.

```json
{
  "schema": 3,
  "label": "Riddarens sarkofag",
  "target": {"kind": "profile", "profile_id": "map-object", "id": "TEMPLATE_UUID"},
  "object_template": {"category": "Monument och ritualföremål", "campaign_id": "CAMPAIGN_UUID"},
  "drive_file_id": "INBOX_DRIVE_FILE_ID",
  "archive_file_id": "ARCHIVE_DRIVE_FILE_ID",
  "source_sha256": "SHA256_OF_ORIGINAL_BYTES"
}
```

Optional fields in `object_template` are `length_m`, `width_m`, `height_m`, `description` and `max_bep`. The keyword `object_template` requests creation after verified Storage readback. A repeat can confirm the same object, campaign and image. To replace the image of an existing template, use its UUID and omit `object_template`. The template keeps its category, dimensions, placement references and campaign. Follow the ordinary queue, Drive archive and Actions checks. Confirm the published `image_reference` and the target's `library_category` and `campaign_id` in `arcane_object_definitions`.

## Storage and readback

The publisher validates that Inbox and archive IDs are distinct, belong to their configured folders, and contain bytes matching the declared SHA-256. It applies the selected profile, writes an immutable SHA-addressed WebP to the profile's approved bucket, and verifies Storage readback. Public profiles are checked through public readback; private profiles use a short-lived signed readback. The database adapter updates only the selected image pointer, preserves profile metadata where configured, and verifies the target after activation.

The publisher never accepts client-selected storage or database destinations. It does not delete originals or prior published objects. Profile adapters that cannot safely preserve the current target's semantics remain unconnected until their adapter is implemented and verified.

DEV submissions use `hermes/core/queue/dev/<request>.json` and the DEV-only workflow on `development`. The top-level queue and LIVE publisher remain restricted to `main`; this DEV change does not trigger or alter LIVE publication.
