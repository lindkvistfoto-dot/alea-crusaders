# Codex follow-up: private Supabase original-byte verification

Read the complete `MEDUSA_MASTER_MANIFEST.json` in the Drive MEDUSA folder (ID `1x49xC5Ueb_Nz_0kJkXiTYNiMLHj5x8aj`). Under `supabase_source_objects` it lists all 519 exact paths, sizes, historical HERMES SHA-256 values and job IDs.

1. Use authorized, read-only Storage access to download each object from project `wbmosmkirsitkonejzpg`, bucket `alea-hermes-source`. Do not use Base64 text transfer, SQL server-file functions, or write operations.
2. Compute SHA-256 over each complete current object, check size, sniff MIME, and fully decode every image. Compare actual results with `source_bytes`, `source_sha256`, and the verified Drive file hash.
3. Confirm the 518 historical Drive matches from current raw bytes. Investigate the single active unmatched source: `symbol/osakerhet/321f72bf5aba7a810ee3573c7d863a7a7f18655092aa46457eb11ce7af7c8e24.png` (2,730,159 bytes; job `c5ad8291-e07a-43cc-adbf-31be5004ca8f`). Preserve current references.
4. Resolve the three GitHub-only originals listed in the MEDUSA inventory report, and the two public WebP objects without direct reference in the inspected DB fields. Do not infer identity from names alone.
5. Return a supplemental file-level manifest. Do not modify Storage, database records, Git history, or active image paths; do not start any HERMES publication.
6. Kerberos cleanup remains blocked until raw verification, archive readback and independent backup readback are complete.
