# HERMES CORE asset cleanup

HERMES CORE V1.0 cleanup removes one registered public system asset through the existing DEV Actions runner. It is not an upload or publication path. HERMES ALEA job cleanup and the fixed SKYLLA source pilot remain independent.

## Agent invocation (DEV only)

The agent writes one exact request file to `hermes/core/cleanup/dev/<request-id>.json` on `development`. The existing HERMES CORE DEV workflow runs the request. The request must carry the complete identity:

```json
{
  "schema": "hermes-asset-cleanup/v1",
  "action": "dry_run",
  "identity": {
    "project_ref": "wkiuyklzzroavclnsxna",
    "bucket": "alea-hermes-public",
    "asset_key": "exact-asset-key",
    "object_path": "hermes/system-asset/exact-asset-key/<sha256>.webp",
    "storage_object_id": "exact-storage-object-uuid",
    "registry_row_id": "exact-registry-row-uuid",
    "sha256": "64-lowercase-hex-digest",
    "bytes": 1234,
    "image_revision": 0
  }
}
```

The dry-run reads the exact registry row and Storage object, hashes the downloaded bytes, and reports references from `honor_definitions`, `honor_relief_variants`, HERMES job records, the badge-frame JSON, and `config/hermes-system-assets.json`. Any reference blocks deletion and is returned in the report. The run emits `HERMES_ASSET_CLEANUP_RESULT` and a downloadable JSON report; it never mutates state.

Only after Zeus separately approves the displayed tuple and `plan_sha256` may the agent update the same file to `action: "delete"` and include:

```json
"approval": {
  "schema": "hermes-asset-cleanup/v1",
  "identity": { "...": "the exact dry-run identity" },
  "expires_at": "the exact dry-run expiry (10 minutes after preflight)",
  "plan_sha256": "the exact dry-run plan_sha256"
}
```

The workflow accepts the delete action only when the push actor is `lindkvistfoto-dot`. It re-reads the registry row, object bytes and references, then removes exactly one path with Supabase Storage `.remove([path])`. After Storage absence is verified, it conditionally deletes the matching `arcane_system_assets` row through the Data API and verifies both absences. It never sends SQL DELETE to `storage.objects`. A retry reconciles the exact object and row; an unknown Storage result is not blindly retried. The GitHub Actions run and JSON report are the audit record; no audit table or new schema is introduced.

The runner rejects other repositories, refs, projects, environments, buckets, paths, identities, revisions and approvers. It does not accept wildcards, directory deletes, caller-selected database destinations or any LIVE project. GitHub creates the request commit; an agent can invoke the flow with its existing GitHub `create_file`/`update_file` capability. The service key remains a masked DEV Actions secret and is never sent back in logs or report content.

## Acceptance

- DEV-only environment and project guard; no deploy or operation on `main`/LIVE.
- Exact object, registry row, bytes, revision and reference checks before dry-run and again before execution.
- Digest-bound separate approval, restricted to the Zeus GitHub actor.
- Storage API delete precedes conditional registry cleanup; no SQL against `storage.objects`.
- Safe handling of repeat calls, lost delete responses, and a lost registry-delete response.
- Unit tests cover wrong environment, changed hash/revision, active references, duplicate call and partial failures.
- A DEV integration deletion requires a separate disposable test asset and its own explicit Zeus authorization; the existing DEV or LIVE pilot assets are not implicit test targets.
- LIVE publication, LIVE pilot deletion, migrations, and changes to other images are out of scope.
