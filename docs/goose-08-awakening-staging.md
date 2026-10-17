# GOOSE 08 – The Awakening Mechanism (staging)

**Status:** review-only development branch; NOT published, NOT merged.

The sealed gate now has **four separate vector animation layers** above the immutable GOOSE 04 HERMES art:

1. Real sapphire ignition (existing GOOSE 07) at each of four physical 90-degree ratchet stops.
2. Two low-contrast engraved paths on each door leaf, illuminated from the 3 and 9 o'clock sapphires toward the upper and lower lock housing.
3. Two interlocking 16:12 brass gear SVGs embedded at the lower middle of the existing sword-and-laurel seal. One turns +180 degrees while the other turns -240 degrees.
4. Two upper and lower piston/rod housings per leaf, retracting after the energy arrives and re-engaging after the leaves return.

All layers are SVG/CSS and adjustable independently for visual calibration. The original three verified transparent WebP files remain unchanged. No raster redraw or change to their SHA-256 manifests; no Supabase data, private campaign media, permissions, or publication flow changes.

Sequence: four sapphire detents -> 680 ms energy fill and gear motion -> 420 ms bolt retraction -> physical split and 1780 ms door travel. On closing, reverse the mechanical lock engagement before extinguishing the sapphires. Media authorization and image aspect morphing remain managed solely by Arcane Gallery.

**Test:** run `npm test -- tests/goose-player-shutter.test.js tests/goose08-arcane-mechanics.test.js`, then `npm run build`, and visually inspect the two GM-only temporary open/close buttons on desktop and mobile. Specifically confirm that the vector channels line up with the actual photographed engravings and piston housings. These path control points are *provisional* pending image review.

**Safety:** no automatic merge or deployment without visual signoff. Browser reduced-motion mode skips the mechanical animation.

## GOOSE 09 source-art alignment

The untouched HERMES left/right door WebPs carry the actual blue sapphire faces near 55.2% of the left leaf and 45.1% of the right leaf (leaf-local horizontal coordinates). The GOOSE09 light masks now originate at these same points and the 49.5% vertical coordinate. The previous GOOSE07 settings lit displaced regions at 35.6%/65.8%; do not restore those offsets. The original sword-and-laurel center sprite remains unaltered and receives no additional SVG cog overlay. The overlay blue ink is extracted from the original same-origin door pixels, never synthesized as new wandering curves.

Final deployment still requires checking the actual authenticated user experience; synthetic Chromium/CI validation alone does not prove that a production deployment reflects `main`.
