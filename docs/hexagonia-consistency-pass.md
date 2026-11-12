# OPERATION HEXAGONIA — Consistency Pass V1

## Purpose
Eliminate visible quality drift between 1-, 2-, and multihex Arcane Bronze Ivory bases without turning base production into a standalone 3D project.

## Source of truth
- HEXAGONIA geometry, row offsets and fixed orthographic camera determine exact hex count, centers, edge contacts, shared boundaries and size.
- Camera trial: elevation **45°**, azimuth **0°**, fixed scale. This is the agreed working angle, not a proven pixel-exact reconstruction of the older perspective artwork.
- The original ornate double-hex artwork supplies **look and feel only**: warm ivory, gold-bronze filigree, compass medallions, diamond caps, lion-head corner reliefs.
- Image generation may refine materials and details, but MUST NOT redraw the geometric silhouette, change the count, move hex centers, rescale tiles independently or invent a different camera.

## Pilot deliverables
1. One-hex base.
2. Two-hex horizontal base.
3. Two-hex diagonal-left base.
4. Seven-hex 2–3–2 base.
Each is a **separate** PNG, not a four-item montage, with true RGBA transparency.

## Mandatory gates
1. Verify exact hex count and edge-adjacent axial centers against exported manifest.
2. For each tile, measure projected width/height and center position; reject if relative size or center-spacing deviation exceeds 1%.
3. Confirm compass rose is centered and entirely inside its own projected hex polygon. This catches the previous mis-projection where ornaments floated beyond the tile.
4. Verify 45° orthographic camera consistency, unchanged scale and wall height, and no internal duplicated exterior walls.
5. Verify PNG RGBA and alpha=0 outside asset, including corners and interior negative-space regions; checkerboard is not alpha.
6. Compare ornament density, marble brightness, bronze hue, lion-head proportions and highlight direction across all four assets. Do not approve a visually mismatched tile merely because geometry passes.
7. If image generation distorts geometry, use the deterministic HEXAGONIA silhouette as an alpha/position mask and composite stylistic details **within** the locked regions; never claim the generator itself respected exact geometry without measurement.
8. Only publish via HERMES after every asset passes; preserve original in Drive Archive, then optimized WebP in Supabase. No production replacement until approved.

## Batch rule
The four pilot assets are the QA gate. Do not mass-produce additional formations until these four pass both geometry and visual review.
