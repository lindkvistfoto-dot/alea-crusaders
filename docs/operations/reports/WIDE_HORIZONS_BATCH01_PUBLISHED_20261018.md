# OPERATION WIDE HORIZONS — Batch 01 published

Date: 2026-10-18. Scope: five skills only. All five WIDE images are active through the established HERMES Drive-push → GitHub archive → Actions publisher → private Supabase Storage → register pipeline. No manual upload or SQL activation bypass was used.

The user approved the photographic portrait masters, requested revised Bluffa/Akrobatik, and authorized HERMES publication followed by the remaining WIDE images. The remaining three were regenerated with those portrait masters and visually reviewed before transfer. Earlier drafts were not published.

| Skill | Lighting | Native / delivery dimensions | WebP bytes | HERMES |
|---|---|---|---:|---|
| Akrobatik | Låg gyllene solnedgång | 1672×941 | 461540 | [active](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124555781) |
| Armborst | Blå skymning efter solnedgång | 1672×940 | 309400 | [active](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124991424) |
| Bluffa | Varmt infallande fönsterljus | 1672×941 | 328666 | [active](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124551210) |
| Botanik | Sval dimmig gryning | 1672×941 | 448438 | [active](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124987817) |
| Geologi | Mjukt mulet dagsljus med ljusöppning över mineralerna | 1672×941 | 437904 | [active](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124999697) |

## Verification

All PNGs decoded successfully, opaque, native dimensions preserved without cropping, stretching or upscaling to mathematical 16:9. Source file sizes and SHA-256 were checked locally. WebP quality 90 (Geologi 87), each under 500000 bytes.

Every publisher log contains VERIFIED and HERMES_ACTIVE for the intended skill/hash. HERMES verified the GitHub binary archive, uploaded without overwrite, downloaded both Storage objects for SHA-256 checks, verified delivery through a signed URL, then activated only illustration_wide_path by compare-and-set. Independent final SQL readback confirmed active jobs without errors, exact source digests, correct register paths, Storage MIME/sizes, active events, and icon_path/illustration_path unchanged against the initial snapshot. All jobs activated on attempt 1.

Actual original illustrations supplied the scene/action/costume; actual approved portrait images supplied photographic face/material realism. The tool does not expose a protected-pixel mask; immutable preservation of individual source pixels is not claimed. Visual review checked recognizable characters, equipment, actions and distinct lighting. Geologi received one framing correction to include the entire boot and hammer; the cropped intermediate was not transferred.

Interactive signed-in Alea browser rendering was not performed. The existing viewer uses the same private skill/<id>/illustration_wide/<uuid>.webp convention. No viewer code was changed.

## Portrait masters

The approved woman and elf-hunter portraits are saved as private named HERMES Drive references and documented in [the production master](../OPERATION_WIDE_HORIZONS.md), commit 56116d43949808dd72e9693820e3ce4cf67d6d43. These are photographic face references, not scene compositions. Future batches must retain explicit reference roles and visible scene-appropriate light variation.

## Akrobatik

- Skill: `public.rule_skills.id=akrobatik`.
- Original square, unchanged: `alea-skill-art/skill/akrobatik/illustration/3bee8115-768a-4963-ac00-2050eaa98a83.webp`.
- Icon, unchanged: `hermes/skill/akrobatik/b86b465be50eff4df02d41163903b787118bce87ef1b0321a6bad300814f5133.webp`.
- Lighting: Låg gyllene solnedgång.
- Selected generated original: `exec-e5174313-6831-43eb-a830-565f06c65082.png`.
- Drive intake ID: `1HBkgpvdGeTtV6WVNruSgDQdVYMTjvxfj`.
- [Immutable WIDE PNG](https://github.com/lindkvistfoto-dot/alea-crusaders/blob/72e8e7c5d211bd774492c6d3d2cd27b6054045a4/assets/hermes/originals/skill-illustration-wide/akrobatik/c3eae2dfd9464809c0332fad02d7d5cccc3fc9b0c10a14e3c9cba7b7aa2a895d.png).
- Source SHA-256: `c3eae2dfd9464809c0332fad02d7d5cccc3fc9b0c10a14e3c9cba7b7aa2a895d`; 2974937 bytes.
- WebP SHA-256: `d5ba3c3f0a7953514e0e10594fe7eb7709fb951a92798075d7c395df4058205a`; 461540 bytes.
- Private original: `alea-hermes-source/skill-illustration-wide/akrobatik/c3eae2dfd9464809c0332fad02d7d5cccc3fc9b0c10a14e3c9cba7b7aa2a895d.png`.
- Private delivery and active WIDE reference: `alea-skill-art/skill/akrobatik/illustration_wide/d5ba3c3f-0a79-4351-8e0e-10594fe7eb77.webp`.
- Job `c421f36a-dfe0-4999-b64c-f794ba96db79`: active; attempts 1; error_code NULL.
- [Publisher run](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124555781); verified archive commit `72e8e7c5d211bd774492c6d3d2cd27b6054045a4`.

## Armborst

- Skill: `public.rule_skills.id=armborst`.
- Original square, unchanged: `alea-skill-art/skill/armborst/illustration/6b2b2534-aa9f-4892-874d-0d218dacaa18.webp`.
- Icon, unchanged: `hermes/skill/armborst/2f0abc015a28eecad5d4594d786ad3cb7c1c0cdca875dc7c2cbad6de0216a930.webp`.
- Lighting: Blå skymning efter solnedgång.
- Selected generated original: `exec-f766ad21-57de-42ff-9e30-68d6a1de0eb2.png`.
- Drive intake ID: `1WVKw16Qfquzsru0kxOQDPZL8zBAhpQv6`.
- [Immutable WIDE PNG](https://github.com/lindkvistfoto-dot/alea-crusaders/blob/45c2146aa6a7130110a6bb7e2007f3c10aea4419/assets/hermes/originals/skill-illustration-wide/armborst/73b1a283a97b48137119dd88a18d9c1d65c114d24ebc967b231759908106f4b3.png).
- Source SHA-256: `73b1a283a97b48137119dd88a18d9c1d65c114d24ebc967b231759908106f4b3`; 2657100 bytes.
- WebP SHA-256: `fc0135f27d083ee11e2fb238e00f3062ce7788a461d8302bd7d9c4f0b6196492`; 309400 bytes.
- Private original: `alea-hermes-source/skill-illustration-wide/armborst/73b1a283a97b48137119dd88a18d9c1d65c114d24ebc967b231759908106f4b3.png`.
- Private delivery and active WIDE reference: `alea-skill-art/skill/armborst/illustration_wide/fc0135f2-7d08-4ee1-9e2f-b238e00f3062.webp`.
- Job `82ec2101-eeec-47c2-8f98-2fcf06be67e1`: active; attempts 1; error_code NULL.
- [Publisher run](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124991424); verified archive commit `45c2146aa6a7130110a6bb7e2007f3c10aea4419`.

## Bluffa

- Skill: `public.rule_skills.id=bluffa`.
- Original square, unchanged: `alea-skill-art/skill/bluffa/illustration/cafcc8cd-a45d-430d-9db3-cb30e9d09a8b.webp`.
- Icon, unchanged: `hermes/skill/bluffa/fc52e2fc60c8f56f7e01be5e4ec3dfc6dd4b69f771cc74985e72518ad609bb64.webp`.
- Lighting: Varmt infallande fönsterljus.
- Selected generated original: `exec-025147e6-b08a-4706-bf2d-8f6533fd0e0f.png`.
- Drive intake ID: `1As5Ymj9aSKFIZ4GHbBiRCzAgSZp20bxV`.
- [Immutable WIDE PNG](https://github.com/lindkvistfoto-dot/alea-crusaders/blob/218705ee70445db3ab6b35db54170696cb2bbf5b/assets/hermes/originals/skill-illustration-wide/bluffa/e2fbdddb42ee4fb71904eaf4b0790521d06586369e3c201f5b9bfa29a5be6001.png).
- Source SHA-256: `e2fbdddb42ee4fb71904eaf4b0790521d06586369e3c201f5b9bfa29a5be6001`; 2515301 bytes.
- WebP SHA-256: `cf8672440ce05dea9aef2bc2b3dcb483f33ddb5bf76e7766ae09dbd99951371a`; 328666 bytes.
- Private original: `alea-hermes-source/skill-illustration-wide/bluffa/e2fbdddb42ee4fb71904eaf4b0790521d06586369e3c201f5b9bfa29a5be6001.png`.
- Private delivery and active WIDE reference: `alea-skill-art/skill/bluffa/illustration_wide/cf867244-0ce0-4dea-9aef-2bc2b3dcb483.webp`.
- Job `681642b4-727f-4a50-9cad-112686332ca7`: active; attempts 1; error_code NULL.
- [Publisher run](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124551210); verified archive commit `218705ee70445db3ab6b35db54170696cb2bbf5b`.

## Botanik

- Skill: `public.rule_skills.id=botanik`.
- Original square, unchanged: `alea-skill-art/skill/botanik/illustration/36c81775-9240-4fc6-b86b-9d6d70daa964.webp`.
- Icon, unchanged: `hermes/skill/botanik/e1a3ff17313c225ae40825aa8e73d2644e7e797127dbb3dfe836c93d2f36d91d.webp`.
- Lighting: Sval dimmig gryning.
- Selected generated original: `exec-13ce24c3-f7a7-436b-9d24-c70e52f83c26.png`.
- Drive intake ID: `1uyaJsErTYCXXJg2wAc17YaFZUASSEH5E`.
- [Immutable WIDE PNG](https://github.com/lindkvistfoto-dot/alea-crusaders/blob/6783eb99536a7b2c36f7e58bac81508e65cfd27d/assets/hermes/originals/skill-illustration-wide/botanik/a8a1a57d8839b83279e713c45b5a2220f235a3e8f50859a0704f54defe5a91a6.png).
- Source SHA-256: `a8a1a57d8839b83279e713c45b5a2220f235a3e8f50859a0704f54defe5a91a6`; 3029674 bytes.
- WebP SHA-256: `6adf0e4b8b34f6d09940ef1577b97071f5d8e2c323f07b275c3e0c9dad0850b2`; 448438 bytes.
- Private original: `alea-hermes-source/skill-illustration-wide/botanik/a8a1a57d8839b83279e713c45b5a2220f235a3e8f50859a0704f54defe5a91a6.png`.
- Private delivery and active WIDE reference: `alea-skill-art/skill/botanik/illustration_wide/6adf0e4b-8b34-46d0-9940-ef1577b97071.webp`.
- Job `22cba5e8-ceed-494b-9993-6fc51d79ca78`: active; attempts 1; error_code NULL.
- [Publisher run](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124987817); verified archive commit `6783eb99536a7b2c36f7e58bac81508e65cfd27d`.

## Geologi

- Skill: `public.rule_skills.id=geologi`.
- Original square, unchanged: `alea-skill-art/skill/geologi/illustration/9bc1466d-a38f-4af8-a6d3-847f6666f3a8.webp`.
- Icon, unchanged: `hermes/skill/geologi/6458bff214ccbea7147ddc534ea2206c571b7f30d9c3a85c9af59c65e3624a43.webp`.
- Lighting: Mjukt mulet dagsljus med ljusöppning över mineralerna.
- Selected generated original: `exec-d044fc6f-b254-43b8-806a-f3d336232a1c.png`.
- Drive intake ID: `1MIAhi_JSexmeDoiHxTcGLG5NB0kYmi1j`.
- [Immutable WIDE PNG](https://github.com/lindkvistfoto-dot/alea-crusaders/blob/dd07c0f75aed73d0b6303befb2fe77cb8bbf1a0f/assets/hermes/originals/skill-illustration-wide/geologi/35d7efd5e97e1c2614add174180a4b5c6613b291db840cf93755ec28e1b92523.png).
- Source SHA-256: `35d7efd5e97e1c2614add174180a4b5c6613b291db840cf93755ec28e1b92523`; 3341972 bytes.
- WebP SHA-256: `bb9f862d888ed034009bd6f2c90aacc7613e5dd872335e1a4ca3b9051c72abda`; 437904 bytes.
- Private original: `alea-hermes-source/skill-illustration-wide/geologi/35d7efd5e97e1c2614add174180a4b5c6613b291db840cf93755ec28e1b92523.png`.
- Private delivery and active WIDE reference: `alea-skill-art/skill/geologi/illustration_wide/bb9f862d-888e-4034-809b-d6f2c90aacc7.webp`.
- Job `29a24517-b620-4d8d-90be-4962a3c5c409`: active; attempts 1; error_code NULL.
- [Publisher run](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39124999697); verified archive commit `dd07c0f75aed73d0b6303befb2fe77cb8bbf1a0f`.

No next batch was started. No other skill images or spell illustrations were changed by this batch.
