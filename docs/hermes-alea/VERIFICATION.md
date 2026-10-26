# HERMES ALEA verification

26 October 2026. Baseline main: `0a569053bd763018ffcaf0e814dd5bf5ddf4ca58`.

Implemented as an isolated, disabled-by-default pilot with two additive migrations, trusted Edge byte validation, shared browser operations, Honors adapters, separate worker/workflow and report-only production cleanup.

Local evidence:

- Entire JavaScript suite: **1,597 tests in 241 files passed**. Includes real PostgreSQL execution through PGlite, authentication roles/RLS, CAS, atomic event/queue activation, missing uploads, ABA revisions, idempotency, fixed Drive intent, shared references and fenced cleanup.
- Production build passed.
- Native Chromium smoke passed at 1280 and 390 px: real canvas alpha PNG -> WebP, CREATE/REPLACE/REMOVE, failure/retry, all three category controls. Transport is mocked; no production account or data is used.
- Edge entrypoint typechecks with Deno and the pinned installed npm dependency. Real PNG/WebP codec tests cover corruption, MIME spoofing, opaque relief rejection and semitransparent alpha preservation. Animation and byte limits fail before activation.
- **10 new worker tests passed**; they cover fixed-ID archive recovery, source/hash failures, independent batch failures, report-only cleanup, inventory pagination and interrupted deletion recovery. **13 existing battle-pose, 22 HERMES 4 and five MINOTAURUS tests passed**; their implementations are unchanged.

Limits:

- No production migration, Edge deployment, credential change, live upload, Drive archive write or production pointer update has been performed. Changed production DB references: **none**.
- Local browser transport and PGlite are not a production end-to-end proof. Real Storage policy behavior, Edge gateway/CORS, archive writer permissions and Drive roundtrip require the approved isolated live pilot described in ROLLOUT.md.
- Automatic deletion remains disabled. Older assets, unknown references and orphans require review.
- The old HERMES worker/workflow files are byte-identical to baseline. No success claim is made for a live HERMES 4/battle-pose run during this task.
