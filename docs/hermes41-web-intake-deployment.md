# HERMES 4.1 — Web Intake worker deployment gate

Dedicated archive folder: 1a_YuFpuD3RBfmNSWKrWJGgT28vnSNzsg

This folder is for immutable original uploads originating in Alea Pages.
The current Drive intake workflow uses drive.readonly. Do not broaden that account.

Before enabling a worker:
1. Provision a separate Google service account with only the archive folder shared to it as writer.
2. Use short-lived Workload Identity Federation credentials; do not store a JSON service-account key.
3. Give the worker read access to private alea-battle-pose-staging and write access to alea-hermes-public through server-side credentials only.
4. Atomically claim hermes_web_jobs with a lease to prevent concurrent double processing.
5. Verify SHA-256 on staging download and Drive original readback before optimization.
6. Convert to WebP, preserve alpha, read back published bytes and verify SHA-256.
7. Only after success update combatant_battle_poses to published/active and mark the job published.
8. Retry safely, quarantine mismatched assets, and never overwrite an immutable original.
9. Validate the full flow with two different combatants and two different bases.
10. Merge the queued UI PR only when a worker is operating and status readback is verified.

The base image is never composited into or archived with the cutout.
