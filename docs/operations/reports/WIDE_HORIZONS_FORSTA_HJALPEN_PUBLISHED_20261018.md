# Första hjälpen WIDE — published and independently read back
Date: 2026-10-18. Skill: `public.rule_skills.id=forsta_hjalpen`.

User approved the displayed image as fully meeting the specification and explicitly requested HERMES publication. Lighting: cool forest blue hour with existing warm campfire and lantern. Source motif was the actual existing icon because the square illustration slot was empty; this exception was disclosed and approved. No further images were generated.

## Verified result
- HERMES job: `f1c4ea0b-1530-4d7d-b927-08a76d8ad3d6`, kind `skill-illustration-wide`, final status **active**, error_code NULL.
- [Publisher run, successful retry](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39114884603).
- Native and delivery dimensions: **1672×941**, user-approved approximate 16:9. No crop, stretch or upscaling.
- Delivery: WebP, quality 90, **366854 bytes**.
- Delivery SHA-256: `002592fafa2f8be9c5c68dca10a6aaf3555567998536b659ce3d590abb5c1ac9`.
- Original PNG: **2600271 bytes**, SHA-256 `3866f63aeff4a89cbc478717809f7921b4d2bc480d1731d87193db875994d04f`.
- [Immutable original](https://github.com/lindkvistfoto-dot/alea-crusaders/blob/0e776224027d2d36f6196135043eab9c9e07fea0/assets/hermes/originals/skill-illustration-wide/forsta-hjalpen/3866f63aeff4a89cbc478717809f7921b4d2bc480d1731d87193db875994d04f.png).
- Private original bucket: `alea-hermes-source`; path `skill-illustration-wide/forsta-hjalpen/3866f63aeff4a89cbc478717809f7921b4d2bc480d1731d87193db875994d04f.png`.
- Private delivery bucket: `alea-skill-art`; path `skill/forsta_hjalpen/illustration_wide/002592fa-fa2f-4be9-85c6-8dca10a6aaf3.webp`.
- Activated only `illustration_wide_path` to that delivery path.
- `icon_path` remains `hermes/skill/forsta-hjalpen/632fc042d48350cb093bbcd0d6ab4b90a13b0f6934e94671bd61995a6862b85e.webp`.
- `illustration_path` remains NULL.

## Transfer evidence
Actual local PNG uploaded to private HERMES Drive Inbox, file ID `1bHffulXxvT14azOpuIBWPxsDmAWC0Hf7`. Active queue intake downloaded the real bytes and verified SHA-256, PNG signature/dimensions and immutable GitHub blob `daeda964c4011ef94e1f328caf30cde743f5438d`. The existing Actions publisher optimized the image, verified GitHub original, uploaded original/delivery without overwrite, downloaded both with SHA-256 checks and verified delivery through a signed URL before activating the register through compare-and-set. Final job event is `active` at 2026-10-18T09:22:36Z.

Independent SQL readback confirmed the job, final register value, preserved older fields, both Storage objects with expected MIME and sizes, and complete event history. The actual delivery path was accepted by Alea's existing `aleaSkillArt.validPath`. Its skill registry loader reads all columns and the existing codex uses `illustration_wide_path` and private Storage. An interactive signed-in browser rendering was not performed.

## Backward-compatible implementation
- `c7c6cb06570e9a706de97c8177baf8b09b463335`: separate WIDE intake/preparation/publisher support and workflow matching; opaque PNG, 0.3% relative aspect tolerance, native-proportion-preserving WebP; separate paths/field; refusal to replace a populated WIDE reference; preservation check on icon and square illustration.
- `15f399e145f0c5fa12843af137a92653cd23c97e`: explicit typed projections for Supabase dynamic selects.
- `efd152a5c00a610829988fece443e8be9bfa959a`: backend-only UPDATE grant for WIDE column, matching existing column-scoped publisher privileges. No authenticated/anon grants or RLS policy changes.
- WIDE kind constraint migration applied and read back.
- 7 Python pipeline tests and 26 targeted Vitest tests passed; production build passed. Publisher Deno typecheck passed in Actions.

## Resolved failures and retry
First publisher attempt stopped before writes on a TypeScript projection inference error; fixed without bypassing typecheck. Next attempt stored/verified media but failed activation because service_role lacked UPDATE on the new column. Added only that backend column grant and reran the same publisher run. Same content-addressed objects and same job were reused, attempts=2, no duplicate media/job and no replacement of existing art. Historical failed events remain in the audit trail.

This report covers only the approved Första hjälpen publication. It does not claim completion of the earlier three-skill pilot or series production.
