# GOOSE 10 — Visual polish after authenticated Gallery screen recording

Status: review candidate. Original HERMES left/right/seal WebP artwork and the ARCANE MORPHING FRAME sprite manifest remain byte-for-byte untouched.

## Purpose

The player-reviewed GOOSE 09 opening (17 October 2026) had an overly fast second 90-degree seal ratchet, cyan engravings/piston retraction that were too subtle, and sapphire lights that tended toward white. GOOSE 10 adjusts only the presentation timing and the existing CSS art layers: no extra gears, dots, sword artwork or server-side changes.

## Mechanism

- Four 90-degree ratchet steps retained, with the established locking order and split/synchronized sliding doors.
- Quarter 2 **90→180 degrees is 1125ms instead of 525ms**, with a deliberately longer low-angle mechanical hesitation; it settles at 180 degrees for **260ms** instead of the ordinary **105ms**.
- Closing uses the exact same heavy 180→90 timing in reverse. Other quarter turns remain 525ms.
- Sapphire positions do not change. Blue sapphire pulse is less white-hot, lasts 350ms and preserves cobalt color.
- Cyan energy remains pixel-extracted from the approved door engravings; it now reveals over 980ms with greater saturation and brighter physical line illumination.
- Original-image clipped upper and lower pistons stroke **2.6%** of door width over **620ms**, rather than 1.2% over 420ms. The 620ms controller step matches their CSS transition. Left pulses/bolts still actuate after lock 1, right after lock 3.
- Door-opening speed remains 1780ms; center sword and laurel remain pristine. Frame morph and private-media authorization/cleanup are unchanged.
- Reduced-motion preference continues to disable motion/transitions while maintaining the same final locked/open art state.

## Acceptance

Run focused Vitest Gallery, GOOSE and role-switch tests and the static build, plus synthetic Chromium recordings. Check steps in real visual playback, especially second ratchet speed, sapphire intensity, source-blue engraved paths and upper/lower bolt visibility. Do not call production visually accepted without user review of an authenticated player/GM screen capture.

The release cache chain from `index.html` through `library.js`, `frodo-ui.js`, `arcane-gallery.js` and shutter CSS/JS is advanced to **GOOSE 10**, avoiding mixed-browser old modules.
