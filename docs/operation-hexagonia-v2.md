# OPERATION HEXAGONIA V2 — Unified Base Library

## Decision
All Arcane Bronze Ivory base assets, including the existing one- and two-hex bases, will eventually be reconstructed from the same deterministic geometry engine. Existing approved artwork is **visual reference only**, not geometry or a texture to stretch. Do not replace live assets until approved replacements pass QA and HERMES publication.

## Locked rendering contract
- Pointy-top regular hexagons; exact axial grid centers, shared edges, no gaps.
- One fixed orthographic High Angle camera, calibrated against the original approved double base; 55 degrees is **provisional**, not an approved calibration.
- Identical world-space dimensions and projected dimensions regardless of depth; no vanishing point.
- Common ivory surface, bronze frame, compass rose, joint hardware and lion motifs built as reusable geometry/material components.
- Exterior walls follow the *union boundary* of the formation; internal seams do not create doubled 3D walls.
- Render on true alpha (SVG background omitted, raster PNG RGBA alpha=0 outside the object); no checkerboard artwork.

## Initial formation library
1, 2, compact 3 (1-2 and 2-1), 4 (1-2-1), 6 (1-2-3 and 1-2-2-1), 7 (2-3-2), 9 (1-2-3-2-1). Rotation/reflection derives valid grid-aligned orientations; no raster rotation that changes camera/shading.

## Release gates
1. Geometry QA: tile count, connectivity, shared edges, centers, size error <=1%, projection consistency.
2. Material QA: visual comparison to the approved double-base reference; decorative details, highlights and reliefs.
3. Alpha QA: true RGBA and transparent exterior, including after WebP conversion.
4. Visual user approval of single and four-hex prototypes.
5. HERMES original -> Drive Inbox -> Drive Archive -> SHA-256 -> optimized WebP -> Supabase.
6. Controlled migration of existing resource keys and Dockverkstaden references only after successful publication and rollback plan.

## Scope boundaries
This PR is a prototype. It does not replace the current production one-hex default, existing published assets or combat renderer. 3D bevels, lion reliefs, camera calibration and end-to-end HERMES QA are still outstanding.
