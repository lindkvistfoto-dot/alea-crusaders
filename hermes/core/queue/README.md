# HERMES CORE developer requests

ChatGPT, Work and Codex stores the original in the configured Drive Inbox and creates a separate original copy in the target's configured Drive archive folder. It then pushes one small JSON request here; image bytes and credentials do not go in GitHub.

The push runs `hermes-core-publish.yml`, which reads the Inbox and archive originals, creates the WebP, uploads it to Supabase and registers or replaces the system-image entry.

Request shape:

```json
{
  "schema": 1,
  "asset_key": "arcane-example-image",
  "label": "Example image",
  "drive_file_id": "INBOX_DRIVE_FILE_ID",
  "archive_file_id": "ARCHIVE_DRIVE_FILE_ID",
  "source_sha256": "SHA256_OF_ORIGINAL_BYTES"
}
```


For an existing award, medal or badge use schema 2:

```json
{
  "schema": 2,
  "label": "Honor image",
  "target": {"kind": "honor-definition", "id": "EXISTING_HONOR_UUID"},
  "drive_file_id": "INBOX_DRIVE_FILE_ID",
  "archive_file_id": "ARCHIVE_DRIVE_FILE_ID",
  "source_sha256": "SHA256_OF_ORIGINAL_BYTES"
}
```

For an existing relief variant use `target: {"kind":"honor-relief","id":"EXISTING_VARIANT_UUID","material":"enamel"}`. Live material values are `enamel`, `metal`, `wood`, `stone`, `other`; old request aliases `metal_relief` and `carved_wood` normalize to `metal` and `wood`. No automatic honor/variant creation or active-variant selection occurs.

Honor originals use `folders.original_archive` in `config/hermes-drive-folders.json`. Both Drive IDs must be distinct, in the configured folders, with the same declared source hash. Never put folder IDs in a request.

A green code CI is not proof of publication. Match the request commit to the CORE run; confirm `HERMES_CORE_ACTIVE`, its Storage path and the database image reference. Preserve prior images and originals when any step fails.
