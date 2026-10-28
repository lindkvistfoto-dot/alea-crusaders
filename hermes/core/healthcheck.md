# HERMES CORE healthcheck

Run these checks before submitting when HERMES CORE availability is uncertain. This procedure is read-only and does not create a Drive file, queue request, Actions run, or Supabase write.

## Checks

1. **Discover the contract**
   - Read `hermes/core/manifest.json` from the repository's `main` branch.
   - Read the current linked operational acceptance and queue README.
   - Confirm the manifest paths resolve. Stop and report a missing path or invalid JSON exactly.

2. **Check GitHub access**
   - Confirm the connected GitHub tools can read the repository, branch `main`, the manifest, workflow, and both Drive configuration files.
   - Read repository metadata to check the connector's reported repository permissions.
   - Inspect recent runs for `.github/workflows/hermes-core-publish.yml` using the GitHub Actions runs endpoint or connected run-list tool. Record the newest run's time, head SHA, status, and conclusion. For a completed run, inspect jobs and step summaries; inspect logs if a step failed.
   - A recent successful run is evidence that the pipeline worked at that time. It does not prove the current request succeeded or that a future run will succeed.

3. **Check Drive access**
   - Read `config/hermes-drive-folders.json`.
   - List the configured Inbox and applicable archive folder using their configured IDs. Do not substitute folders based on names or search results.
   - If a folder cannot be listed, report its configured role and access error. Do not upload a probe file.

4. **Check Supabase visibility**
   - Confirm the configured project is reachable and inspect the required table schema through read-only project/table tools.
   - Do not upload to Storage, change a database row, expose secret values, or run a test publication.
   - Supabase Storage write/readback capability is evidenced by the publisher's actual successful Actions run, not by a metadata-only check.

5. **Check current attachment transfer when a file is attached**
   - Confirm the exact original bytes can be resolved to a local file path readable by the local SHA-256 calculation and Drive upload action.
   - If the session can see the image but cannot access its bytes as a file, report that precise limitation and stop. Do not recreate, convert, or route the image through an unconfigured location.

## Report

Return each check as `available`, `unavailable`, or `not verified`, with the evidence and timestamp where applicable. Distinguish an old successful pipeline run from a publication in the current request. Do not label the system fully ready if original-file transfer, a required connector, or the requested target cannot be verified.

A failed last run does not by itself justify a retry. Inspect the exact request commit and logs first, then follow the queue contract's recovery rules.
