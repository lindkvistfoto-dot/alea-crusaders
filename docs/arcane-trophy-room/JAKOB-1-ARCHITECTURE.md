# OPERATION ARCANE TROPHY ROOM — JAKOB 1
## Architecture and production gate

Status: design and architecture only; no scene enabled. JAKOB 2 starts only after approval.

### Verified inventory (2026-10-24)
- ARCANE HONORS domain merged via PR #241; admin UI and closed schema migration merged via PR #242.
- PR #243 (feature/arcane-honors-live-data) contains authenticated API bridge, admin wiring, recipient reads, GM RLS policies and character-panel placeholder. All four last-observed GitHub workflows passed; PR not merged at this inventory.
- Live Supabase project: wbmosmkirsitkonejzpg. Tables public.honor_definitions and public.honor_grants exist with RLS enabled; GM policies applied. No verified end-to-end grant yet.
- Character full figure: legacy/app.js currentEquipmentFigureHtml(character) reads character.figureImages.base as data:image/png/jpeg/webp; equipment stage uses .gandalf-equip-character in .gandalf-equip-center. Armored variant is deliberately not used in equipment stage.
- No separate character art should be generated for the trophy room. Reuse the same figureImages.base source, with safe fallback when absent.
- Admin is the #admin section, with adminOverview cards and admin-detail sections in index.html.

### Locked art direction
Photorealistic physical medieval hall, ivory/bronze/stone, torches, realistic worn metal and short military medal ribbons. No game-like candy-colored badges or permanently visible UI grids. Character stands in the foreground FACING THE VIEWER, using exactly the same figureImages.base source as Current Equipment. Do not mirror/reinvent the character's identity or equipment.

### Space and camera
- Three physical walls: left = in-game automated rewards; center = adventure medals; right = GM-granted honors.
- Overview camera: all three walls and the front-facing character visible in the foreground. Position character low enough not to obscure central adventure medals.
- On wall zoom, smoothly fade out the foreground character as the camera travels toward the selected wall; reverse fade on return. Character remains an independent layer, never baked into the room art.
- Each wall has its own camera target and zoomed wall texture / higher-resolution art; smooth ~700–1000ms transitions with easing and restrained parallax.
- All interactive medal anchors are separate DOM objects, never baked into scene art.
- Reduced-motion and low-end fallback: instantaneous navigation, static lighting, no particles.
- Keyboard access: tab to wall and medals, Enter/Space activates, Escape returns to overview. Touch targets >=44px.

### Rendering architecture
Layer 0: room master background without medals or character.
Layer 1: optional wall-specific high-resolution backgrounds.
Layer 2: front-facing character figureImages.base cutout, foreground with floor contact shadow and restrained torch rim light. Opacity transitions during wall navigation; must respect original perspective and source.
Layer 3: medal anchor layout mapped in normalized coordinates per wall, with depth transforms.
Layer 4: real-alpha medal images via HERMES stable resource identifiers.
Layer 5: optional torch flicker, dust, lighting and ambient audio.
Layer 6: medal detail overlay (name, earned date, adventure, GM, requirement, description).
Never bake medal images or award text into background. Layout is data-driven and grows with grants.

### Data and security
- Definitions belong to the shared award catalog; grants to individual characters, independent of campaign lifespan.
- Secret awards must not leak names, images, requirements or counts.
- Public unearned awards show requirements; silhouette awards show only shape; earned awards reveal details.
- Authoritative server-side projection needed for players before release. GM-only direct table reads are not suitable as player API.
- Idempotent award granting, revocation history, and permission checks must be end-to-end tested.

### Production assets
1. 16:9 room master with empty walls, no figure/medals/UI, high resolution.
2. Three wall closeups with consistent architecture and camera perspective.
3. Optional torchlight/dust effect sprites with true alpha.
4. Medal art as separate transparent assets. Verify alpha numerically (not checkerboard pixels).
5. HERMES archive/optimization/publication provenance for every new source.

### Acceptance for JAKOB 1
- Inventory recorded: DONE.
- Architecture, scene layers, camera and coordinates specified: DONE.
- Source for current equipment figure identified: DONE.
- Dependencies on PR #243 and secure player projection identified: DONE.
- Approved master art and camera calibration: PENDING JAKOB 2 pilot.
- No publication/merge of scene functionality in this phase.

### JAKOB 2 pilot
Create one medal-free room background and three matched wall closeups. Implement camera navigation in an isolated feature flag. Test on desktop/mobile. No live medal writes. Pause for visual sign-off.
