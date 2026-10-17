# GOOSE 09 — Ceremonial Gallery shutters: implementation and acceptance

**Technical status (17 October 2026):** integrated on the GOOSE09 release branch, with focused Gallery PR tests, production build and synthetic Chrome mechanical-sequence test passing. Merge to `main` is a distinct release step. Production deployment and authenticated GM/player visual acceptance require a live-session check.

## Approved artwork — do not redraw

- The immutable GOOSE04/HERMES transparent WebP assets `left.webp`, `right.webp` and `seal.webp` remain unchanged. Each door is a real 2:3 metal half of the 4:3 closed aperture.
- The original sword, laurels and round emblem remain intact. GOOSE08's extra SVG cog/hub overlays are **not mounted** in GOOSE09.
- ARCANE MORPHING FRAME remains separate: the existing 29 HERMES sprites are preserved, with segmented rails, independently rotating wheels, telescopic rods and responsive image proportions.

## Actual live graphic layers

1. Three original door/sigil image sprites, moving as rigid objects. The center seal remains a whole rotating image for all four ratchets; its left and right halves become precisely registered crops attached to the door plates only after one full revolution.
2. Existing four sapphire stones lit by optical overlays, without extra button-shaped dots. North/south illumination is split across the moving seam.
3. Two independent original-blue-ink canvases, one per door, tinted from the real cyan/blue pixels in the approved HERMES bitmaps. Their circular reveal originates near the actual side sapphires (left leaf 55.2%, right leaf 45.1%, both 49.5% vertical); no fabricated blue line is drawn on the original.
4. Four clipped duplicates of the original metal lock artwork for subtle upper/lower bolt motion, synchronized with their respective blue energy pulses. No CSS-drawn bronze blocks or stretched pistons.

## Mechanical timing

- Four 90-degree ratchet steps, each 525 ms with 105 ms between steps.
- Step 1: left sapphire, original blue channels light for 770 ms, then left bolts release over 420 ms.
- Step 3: right sapphire, blue channels light for 770 ms, then right bolts release over 420 ms.
- The fourth detent completes the 360-degree lock; seal crops remain physically attached to their moving door halves.
- Both doors withdraw simultaneously over 1,780 ms. On closure the doors meet first and the locking process runs in reverse.
- Reduced-motion settings skip moving transitions while preserving correct states.

## Application behavior and security

The SAME Arcane Gallery viewer is used for GM and players. GM staging/administration is separate and the temporary GM-only Open/Close test controls do not publish material. All images are selected from authorized campaign presentation history, never from the public mock preview. Private Blob URLs are revoked on logout, role switch, campaign change, and withdrawal of shared images. The frame morphs only after the initial authorized ceremonial opening.

## Verification

- [GOOSE09 focused Gallery verification](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39044048810) — passed (Vitest, authorization and four-ratio browser smoke, production build).
- [GOOSE09 Chrome mechanical phases](https://github.com/lindkvistfoto-dot/alea-crusaders/actions/runs/39044048675) — passed with screenshot artifact of the closed door, left/right sapphire activation, bolting, travel and open state.
- The full repository CI still has failures in unrelated legacy tests; those are NOT represented as passing.
- Genuine signed-in player/GM visual acceptance and deployed commit verification are still required to claim a visually approved production experience.

## Visual acceptance checklist

Open the deployed Gallery with a real authorized player and GM. Confirm the authentic metalwork/sword, correct sapphire location, blue engraved lines, left/right lock progression, joined and separated seal, no distortion at 4:3, and smooth morph to 16:9 / 1:1 / 9:16. Repeat opening/closing with the GM test controls, verify smaller screens and reduced motion, then revoke access and verify no private image remains.
