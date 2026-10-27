# HERMES CORE developer requests

ChatGPT Work stores the original in the configured Drive Inbox and creates a separate original copy in the target's configured Drive archive folder. It then pushes one small JSON request here; image bytes and credentials do not go in GitHub.

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
