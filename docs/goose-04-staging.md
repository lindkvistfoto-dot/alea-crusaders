# GOOSE 04 – Player-only shutter integration staging

**Status: development branch / opt-in scaffold. Not deployed.**

The approved GOOSE ceremonial design is now represented by a standalone motion prototype with transparent left and right plate artwork and one unbroken sword-and-laurel emblem. HERMES master artwork is not yet in GitHub and must NOT be inferred from an isolated static illustration.

The code module `features/material/goose-player-shutter.js` exports a rendering controller and `features/material/goose-player-shutter.css` contains the player-only overlay geometry. Neither is imported or activated in the currently deployed Arcane Gallery. In this PR the module is **intentionally dormant** to protect existing campaign images and leave the GM preview exactly unchanged.

### Strict release sequencing

1. Approve the offline GOOSE 04 prototype and finish the hidden metal/sigil release mask in the actual art layers.
2. Transfer the transparent production WebP parts through the verified HERMES route with a cryptographic manifest.
3. Load these assets into a **player-only** gallery integration. Use 4:3 when closed or opening, reveal the actual image only once the existing authenticated media request has loaded, and only then morph to the image aspect ratio.
4. For all subsequent image navigation, morph to the next media ratio without replaying the large ceremonial entrance.
5. Immediately reset and revoke private Blob URLs on campaign switch, logout or loss of player permissions; visual closing may never delay access revocation.
6. Verify mobile and desktop, rapid repeated clicks, reduced-motion, live presentation history, isolation from the GM preview and remaining empty-carousel slot treatment.
7. Merge only after tests, deployed visual review and explicit approval.

### Files and caveats

No new Supabase tables or database writes. No public access to private campaign media. No modifications to the GM preview. The optional controller accepts only repository-local WebP sources and never reads campaign data.

The standalone offline prototype and its source sprite ZIP are delivered separately. The split GOOSE 04 art includes machine-generated decorative bronze extensions used to keep original metalwork undistorted in 4:3; these remain *provisional* until final image approval.
