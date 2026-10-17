# ARCANE MORPHING FRAME v0.1 · SISYPHUS acceptance

**Status (2026-10-17): merged into `main` via PR #44.** The image assets, frame composition and CSS are in the repository default branch. This does **not** independently verify that a particular production site is deployed, authenticated end-to-end or visually accepted. No Supabase schema or campaign content is changed by this frame.

## Source of truth

- Drive original: `ARCANE_MORPHING_FRAME_v01_source.zip`
- Immutable ZIP SHA-256: `4878fe146bcaaf301e535b34fc9402ecaa5eff33e9caa0adfb2910984c314178`
- Lossless source sprites: **29 of 29**, each individually SHA-verified in `features/material/arcane-morphing-assets/v01/manifest.json`
- Source archive: `assets/hermes/originals/ui/arcane-gallery-kit/4878fe146bcaaf301e535b34fc9402ecaa5eff33e9caa0adfb2910984c314178.zip`
- Active runtime composition uses the top/bottom rails, two independently animated wheel sprites, left/right segmented columns, two gem mounts, and four piston art states (closed/extended × left/right). Remaining art assets are preserved for future layout refinement; do **not** stretch them to make them fit.
- Source media in the GM/player viewer stays private. Publicly committed sprites and sanitized preview art contain no campaign image assets.

## Animation

- `arcane-gallery-aspect.js` calculates the media opening and frame height without stretching the media.
- The same scalar extension drives inverse gear rotations and the crossfade between the real closed and extended piston images. Animated height makes the straight chrome rods extend between fixed bronze assemblies.
- Responsive aspect targets: **16:9 / 4:3 / 1:1 / 9:16**. Future HTMLVideoElement metadata is supported in the geometry helper; this does **not** claim that the gallery currently accepts video uploads.
- `prefers-reduced-motion` disables transitions, including piston art crossfade.
- GM preview and player gallery share the same mechanical markup, while their campaign-scoped permissions remain separate.

## Visual browser references

- [Desktop: all four aspect ratios](../tests/visual-regressions/arcane-morph-desktop.png)
- [Mobile: standing 9:16](../tests/visual-regressions/arcane-morph-mobile.png)
- Fixture: `tests/fixtures/arcane-gallery-visual.html`, which imports the real component markup and CSS, renders public synthetic media, and is photographed in headless Chrome by `.github/workflows/arcane-gallery-visual.yml`.

The desktop/mobile snapshots validate *static appearance and media fit*. The recorded Chromium GIF validates real CSS motion with synthetic content. None of these is a substitute for an authenticated end-to-end session with actual GM/player accounts, nor for future video playback testing.

## Fixed production browser bug (2026-10-17)

The player gallery and GM preview both previously used `new win().IntersectionObserver(...)`. When browsers support IntersectionObserver, JavaScript tries to construct `win` instead of `win().IntersectionObserver`, causing the carousel to stop before the image is fetched. The constructor is now explicitly parenthesized as `new (win().IntersectionObserver)(...)` in both components. The synthetic browser smoke exercises this actual rendering path rather than only mocking the interface.

## Verification and release gates

1. HERMES source, WebP transparency and individual image SHA checks: **passed**.
2. Focused Gallery test suite, including new real piston sprite assertions: **passed**, plus static build.
3. Desktop/mobile sanitized browser snapshots: **generated and reviewed**.
4. Broad repository CI: still has exactly **48 failures in 27 test files**, matching the baseline `main` run at SHA `98427d9` (also 48 failures / 27 files). The gallery work did not increase this count; a broader regression triage is separate and must not be hidden.
5. Automated Chromium role-switch smoke: `tests/fixtures/arcane-gallery-role-smoke.html` + `scripts/arcane_gallery_role_smoke.cjs`; gates both focused PR and main release workflows. **This uses synthetic images and mocked roles, not real Supabase credentials.** Covers player and GM gallery DOM and media dimensions at four ratios, camera-independent frame height, carousel switching, campaign-scoped request routes, revoked object URLs and clean logout.
6. Existing broad CI baseline is **red** (48 failures / 27 files measured at PR #44 merge). The scoped Gallery test suite and browser smoke provide an isolated quality gate; they do not reclassify or waive the red broad-suite findings. A repository-wide CI cleanup remains a separate task.
7. **Still required for genuine production acceptance:** an authorized player account and GM account must open the deployed Alea application, cycle real campaign images through 16:9 / 4:3 / 1:1 / 9:16, verify animated pistons/gears, carousel and revoked image access after a role/campaign change; verify the deployed version equals the tested commit. No secrets, private pictures or fake login are bundled in the test. Final visual acceptance follows this manual check.

## Manual authenticated acceptance checklist

1. In a test campaign, GM stages four private images matching the ratios and checks they remain private before sharing.
2. GM opens **Arcane Gallery**, uses Previous/Next and portrait/landscape changes; piston artwork remains rigid, rods telescope, gears counter-rotate and full-screen preview works.
3. A different account with player role opens the same campaign, sees only pictures explicitly shared by GM, and can navigate the same ratios and carousel.
4. Unshare/archive an image, switch campaign and sign out. Confirm stale images cannot be recalled or displayed from another role or campaign.
5. Check a narrow mobile screen and desktop. If all pass, mark as final accepted; otherwise file a reproducible visual defect against the frame.

