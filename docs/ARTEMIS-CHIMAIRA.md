# OPERATION ARTEMIS / CHIMAIRA — Google Drive layout

The authoritative folder ID registry is `config/hermes-drive-folders.json`.

## Status (2026-10-20)
- Created the `ALEA – HERMES` root and its original archive, review, quarantine, batches, backup, and staging directories.
- **Moved and renamed the existing Inbox** to `ALEA – HERMES / 01 – INBOX` without changing its Drive ID `1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp`.
- Verified the existing HERMES service account `hermes-transfer@alea-hermes.iam.gserviceaccount.com` remains a reader and that the Inbox still contains 579 files at the time of inspection.
- No original images moved to archive or staging, no images deleted, no production image pointers changed.

## Important operational constraints
1. All automated integrations MUST use Drive file IDs and folder IDs, never folder titles. The existing HERMES Drive queue uses explicit source file IDs; it should continue to work after the Inbox move. A successful metadata read is **not** a substitute for a new service-account download test.
2. `01 – INBOX` is a temporary intake. Never automatically delete a source before its archive copy, SHA-256 readback and independent backup are proven.
3. `02 – ORIGINALARKIV` is the planned permanent home for approved original PNG files, organized by asset category and variant. Do not populate it before Medusa inventory and Kerberos validation.
4. `07 – MEDUSA STAGING` is a staging area for current spell icons, legacy history, and unclassified sources. **Do not move the 13 Hydra-pending spell images or any legacy images during Chimaira.**
5. The `06 – SÄKERHETSKOPIOR` folder is only a placeholder. A second folder in the same Drive account is not an independent backup.
6. This PR is documentation/configuration only. It does not alter GitHub Actions, Supabase, application code or HERMES publication behavior.

## Handoff to Medusa / Kerberos / Hydra
- Medusa: enumerate all existing Inbox items, their IDs, sizes, checksums (when read from bytes), use/status and duplicates; classify without moving or deleting.
- Kerberos: implement source integrity, archived Drive ID, independent backup, and immutable manifest validation.
- Hydra: consume one batch manifest of Drive IDs, fetch only the listed originals, publish independently and verify active database pointers without storing new PNG originals in Git.
