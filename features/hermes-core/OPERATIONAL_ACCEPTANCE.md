# HERMES CORE – developer publishing

HERMES CORE handles developer image publishing from ChatGPT Work. HERMES ALEA remains the separate upload flow for web users; CORE does not use its temporary Storage bucket or archive worker.

## Publishing flow

1. Put the original in the configured Google Drive Inbox.
2. Put a separate copy of the same original in its Drive archive folder.
3. Push a request JSON to `hermes/core/queue/` using the shape in that directory's README.
4. GitHub Actions reads both Drive files with the existing read-only WIF service account, creates an optimized WebP, uploads it to `alea-hermes-public`, and creates or replaces the system-image entry in `arcane_system_assets`.
5. The original remains in Drive. GitHub Actions keeps no durable image copy.

The workflow uses the existing `HERMES_SUPABASE_SERVICE_ROLE_KEY` only in its trusted runner. No new credential, database grant, migration, or workflow gate is required for this path.

## Current runtime scope

The first developer publisher handles `arcane_system_assets`. The existing CORE target adapters remain available for subsequent target connections. The web-user HERMES ALEA caller and its scheduled Drive archive job remain independent and are not changed by this workflow.
