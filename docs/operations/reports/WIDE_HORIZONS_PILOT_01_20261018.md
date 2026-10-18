# WIDE HORIZONS — PILOT 01: BLOCKED, NOT PUBLISHED
Date: 2026-10-18. Master: docs/operations/OPERATION_WIDE_HORIZONS.md (blob efdefcd2f0e5e728d7a8f9f8ab7305538d05958c).

## Outcome
Three skills have image-based widescreen drafts; none passed all critical QA gates. No transfer was initiated, no WIDE job was registered, and no database or Storage writes were performed. This pilot does NOT meet Definition of Done.

| Skill ID | Drafts | Lighting | QA | HERMES | Supabase WIDE |
|---|---:|---|---|---|---|
| geografi | 2 | Natural daytime, softer cloud diffusion in attempt 2 | Rejected | Not started | NULL |
| astrologi | 1 | Cool night sky plus existing warm lantern | Rejected | Not started | NULL |
| administrationsjuridik | 1 | Warm afternoon window light | Rejected | Not started | NULL |

## Source provenance
Actual immutable HERMES originals were retrieved from the repository, visually inspected and checked against the active Supabase HERMES source jobs and rule_skills references. Running the existing HERMES preparation script reproduced the exact active delivery SHA-256 for all three sources. Private Supabase source/delivery objects were not independently downloaded in this session.

| Skill | Original PNG SHA-256 | Reproduced active delivery SHA-256 |
|---|---|---|
| geografi | 777ac2c82e03345ecc795d5cca4a5a8291aa8e83713bf6aedc0429ee0ef32ce6 | bf5053bfa18e339e203a147d1bf8c0e4b4a5c6e96125c9f68f296337e2b9445b |
| astrologi | 0b5da7d7017dac392304b1c189dd2f0f8c5d97caabf000d5290560605837692a | 69744c6bd93742b076d65eaf4fa8a13c98eb4f2e2ece0a9a474e275f61bf7569 |
| administrationsjuridik | 158986009c2bc02a24352a14a151269030c61df796818dd3c841e2620a2b295c | 2b11cc09766988ceceeee45ff42fee7172235400196698224d10b080a13e8118 |

Originals: assets/hermes/originals/skill-illustration/<skill-id>/<original-sha256>.png.
Delivery bucket: alea-skill-art.
Existing delivery paths:
- geografi: skill/geografi/illustration/bf5053bf-a18e-439e-a03a-147d1bf8c0e4.webp
- astrologi: skill/astrologi/illustration/69744c6b-d937-42b0-b6d6-5eaf4fa8a13c.webp
- administrationsjuridik: skill/administrationsjuridik/illustration/2b11cc09-7669-48ce-8eee-e45ff42fee71.webp

## Image generation and QA
The built-in image generator received each actual original PNG as its edit target and explicit instructions for environmental outpainting, full vertical-content preservation, identity/costume/setting preservation, live-action photographic realism and scene-appropriate lighting. No text-only generation was used. The tool does not expose a protected-pixel mask here; pixel-preserving masked outpainting therefore was not established.

All four returned PNG files were decodable and were **1672×941**, despite explicit requests for exact 16:9 and 1920×1080 or 2560×1440. These dimensions fail width×9 == height×16. Native resolution is reported as delivered; no upscaling, cropping or stretching was used to conceal the mismatch.

Visual findings:
- Geografi attempt 1: map retained raised terrain appearance; rejected.
- Geografi attempt 2: map corrected to flat ink symbols; recognizable costume/action retained. Photographic realism remains insufficient for unconditional approval, and landscape arrangement drifts from the strict source. Rejected.
- Astrologi: seated observer, astrolabe, star chart and lantern recognizable; remaining rendered/illustrative appearance and insufficiently established exact landmark fidelity. Rejected.
- Administrationsjuridik: two characters, seal-pointing interaction and hall retained broadly; polished illustrative appearance and expanded/rearranged hall/desk details require stricter fidelity review. Rejected.
- The previously approved Geografi WIDE quality prototype was not retrieved in this session; no comparison against that unseen prototype is claimed.

Draft SHA-256 references (images displayed in the producing conversation):
- Geografi attempt 1: dae1045baa28477317890c9c4c378c6082c0c3e57f89f78fef6ca4af94bbe7c8
- Geografi attempt 2: b95225aa0d400376be9d1131f6882ed5695cbb720acb84d537f95361aa2c88f3
- Astrologi: 02836184d1388fc73c64237ad5c70f0547708c3d93e1256af71b923ab63210fa
- Administrationsjuridik: 08192dfaf2b57d26b2c362092478dbe8f417152175dadcfb457a6f1a85598fc7

## HERMES infrastructure inventory
- Existing standard is Drive Inbox → active JSON queue commit → OIDC-authenticated Actions intake → immutable GitHub PNG → HERMES preparation → trusted Actions publisher → Storage checksum readbacks → database compare-and-set → active job.
- scripts/hermes_drive_intake.py accepts skill-illustration but requires square originals.
- scripts/hermes2_prepare.py accepts skill-illustration but requires square originals and creates 640×640 WebP.
- scripts/hermes2_publish.ts accepts skill-illustration and updates illustration_path; it does not implement illustration_wide_path.
- Installed public.hermes_jobs kind constraint accepts only spell, symbol, skill and skill-illustration.
- Deployed hermes-v2 Edge Function v8 is an older square spell/symbol endpoint; it is not the newer Actions skill publishing path and must not be used for this pilot.
- The application already supports illustration_wide_path through features/skills/admin-art.js and features/skills/skill-codex.js, using private alea-skill-art.
- The existing WIDE database path constraint permits skill/<id>/illustration_wide/<uuid-v4>.webp (also png/jpg).
- No active/pending WIDE job or nonterminal job for the three chosen target keys was returned at inspection.

**WIDE publishing is not implemented by this session.** A backward-compatible dedicated kind/profile is still required across intake, preparation, publisher, workflow filtering and database kind validation, with exact dimensions, opaque media, separate immutable paths, preservation of both existing fields, refusal to replace populated WIDE references, idempotency, checksums and readback tests. No manual upload bypass was created.

## Final readback
Supabase rule_skills was read again. All three illustration_wide_path values remain NULL. icon_path and illustration_path still match the initial inventory. No new HERMES job exists for these rejected drafts. New-image Storage access and the Alea WIDE UI could not be tested because no draft was approved or published.

## Remaining work
Obtain image outputs that actually pass the photographic/fidelity/exact-format gates, retrieve the approved visual prototype, implement and test the backward-compatible HERMES WIDE profile, then transfer and verify all three images through the established pipeline. Do not start series production.
