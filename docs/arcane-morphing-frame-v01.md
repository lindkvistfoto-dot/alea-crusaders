# ARCANE MORPHING FRAME v0.1 · SISYPHUS acceptance

**Status: preview branch only.** `main`, production deployment and Supabase remain unchanged.

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

These screenshots validate the *static appearance and media fit*. They do not substitute for a real-time animation walkthrough, an authenticated end-to-end user session, or video playback testing.

## Verification and release gates

1. HERMES source, WebP transparency and individual image SHA checks: **passed**.
2. Focused Gallery test suite, including new real piston sprite assertions: **passed**, plus static build.
3. Desktop/mobile sanitized browser snapshots: **generated and reviewed**.
4. Broad repository CI: still has exactly **48 failures in 27 test files**, matching the baseline `main` run at SHA `98427d9` (also 48 failures / 27 files). The gallery work did not increase this count; a broader regression triage is separate and must not be hidden.
5. **Outstanding before production:** authenticated in-app visual/interaction smoke test for GM/player switch and real image carousel; decision on existing red baseline CI; final release approval.
