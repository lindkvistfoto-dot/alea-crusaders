# Alea Crusaders architecture

## Goal
Keep the application easy to change without another monolithic `index.html`.

## Layers

- `index.html` — HTML shell only. It remains directly serveable without a build step.
- `src/` — Vite-managed ES modules and styles. New code should normally be added here.
- `features/` — compatibility packages extracted from the historical classic script. These remain classic scripts while inline HTML event handlers are migrated.
- `legacy/app.js` — remaining legacy application code. This file should shrink over time, not grow.
- `supabase/migrations/` — database schema history. Never edit an already-applied migration.

## Feature ownership

Combat is split into:

- `features/combat/admin-scenes.js` — combat-scene administration and hex editor.
- `features/combat/runtime.js` — active combat runtime UI.
- Future pure/testable combat logic belongs in `src/features/combat/`.

## Rules for new work

1. Do not add CSS or JavaScript inline to `index.html`.
2. Prefer a feature folder under `src/features/` for new functionality.
3. Keep database/storage access separate from rendering when touching existing code.
4. Add or update tests for pure rules/math.
5. Run `npm run check` before merging.
6. Schema changes require a new migration in `supabase/migrations/`.

## Migration strategy

We are intentionally not rewriting the whole application at once. Existing classic code is moved feature-by-feature into compatibility packages, then pure logic is migrated to ES modules/TypeScript when that feature is next developed. This keeps behavior stable while steadily reducing the legacy surface.

## Hosting compatibility

The source tree can still be served directly as a static site. Vite is the development/build layer, not a runtime requirement. Production builds copy the classic compatibility packages and dice assets into `dist/`, while CSS and ES modules are bundled by Vite.
