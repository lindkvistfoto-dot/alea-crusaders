# HERMES CORE LIVE exact asset cleanup

LIVE cleanup uses the existing HERMES CORE GitHub Actions pipeline and the existing
`HERMES_SUPABASE_SERVICE_ROLE_KEY` secret. It runs only from `main`, targets
the fixed Supabase project `wbmosmkirsitkonejzpg`, and uses the existing Storage
API plus the `arcane_system_assets` registry. DEV cleanup remains on its separate
`development` workflow.

## Request format

Add one metadata-only JSON request under
`hermes/core/cleanup/live/<lowercase-name>.json`. A dry-run request has this form:

```json
{
  "schema": "hermes-asset-cleanup/v1",
  "action": "dry_run",
  "identity": {
    "project_ref": "wbmosmkirsitkonejzpg",
    "bucket": "alea-hermes-public",
    "asset_key": "arcane-hermes-core-live-pilot-20261105",
    "object_path": "hermes/system-asset/arcane-hermes-core-live-pilot-20261105/9a6e0d0f11eaae66b702859d46a9f6a01559d62ae6c80afa19d060213af8341b.webp",
    "storage_object_id": "495f658d-0aa8-42ab-af84-d5b2a1d167f9",
    "registry_row_id": "ac8dd8a2-fa0b-48c3-9a40-eea204d298f0",
    "sha256": "9a6e0d0f11eaae66b702859d46a9f6a01559d62ae6c80afa19d060213af8341b",
    "bytes": 3142,
    "image_revision": 0
  }
}
```

The request must identify one object completely. The engine compares every supplied
field with the LIVE registry row and Storage metadata, hashes the downloaded bytes,
and scans the existing application references. A dry run reports
`dry_run_clear` or a blocker and never invokes Storage deletion.

For deletion, change `action` to `delete` and include the current dry-run result
under `approval`: its schema, exact identity, `expires_at`, and `plan_sha256`.
Plans expire after ten minutes. The engine verifies the GitHub actor, recomputes
the digest, rechecks all identifiers and references, removes the exact Storage
path through Supabase Storage API, conditionally removes only the exact registry
row, then verifies both are absent. The report must end at
`deleted_verified_absent` with `delete_api_invoked: true`.

A push that changes one cleanup request triggers only `asset-cleanup-live`.
Changes to `hermes/core/queue/*.json` continue to trigger only the existing
`publish` job. A commit changing both paths routes both jobs independently.
Invalid paths, multiple cleanup request files, identity drift, references, expired
plans, or readback errors fail closed. No SQL deletion from `storage.objects` is
used.