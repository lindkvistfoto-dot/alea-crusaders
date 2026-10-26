# OPERATION PHOENIX — HERMES V (Troférum pilot)

**Purpose:** one approved PNG in → one verified system asset out. No replacement of HERMES 4.x.

## Operator steps (GitHub Actions)

1. Open **HERMES V – Troférum (PHOENIX pilot)** on main.
2. Choose **red**, **green** or **blue**, then **verify**. The run checks the pinned Inbox PNG SHA-256 and RGBA quality without publishing.
3. Choose the same color and **publish**. The existing HERMES runner checks the *independent archived Drive copy*, converts to WebP, publishes to Supabase, reads back and registers the system asset.
4. Green workflow plus a valid `arcane_system_assets.asset_path` is the completion criterion. Read the retained report artifact for each attempt.

**Mapping:** red = center wall, blue = left wall, green = right wall.

The three original PNGs are already in HERMES Inbox; independent copies are in the existing system-asset original archive. The pinned SHA-256 values were computed from the uploaded original files. The pipeline verifies both Drive copies byte-for-byte at run time.

**Safety:** no source files in GitHub; no browser secrets; no automatic trigger; no deletion; no success claim until source, archive, optimized file, Storage and DB pointer pass. Failed attempts are visible in GitHub Actions and report artifacts. Re-running the same color is safe only subject to existing publisher idempotency and pointer checks.

**Scope:** this pilot handles only the three approved medal display frames. Existing spell, skill and battle-pose HERMES pipelines remain untouched. The central medal popup uses the red system asset after publication; other walls will use blue/green when implemented.

**Do not merge until CI and workflow review pass.** A successful CI is not evidence that the live HERMES V run has published an image.

## HERMES V universal intake

The workflow now accepts every asset kind already implemented by the HERMES publisher: system assets, spell/skill icons and illustrations, cutouts, and symbols. The operator supplies kind, target key/ID, Inbox Drive ID, independent archive ID, original SHA-256, visual approval, and verify/publish. The three trophy frames remain pinned presets in the adapter for regression tests.

**Scope is no longer limited to trophy images.** Existing destination schemas and target registrations still apply; a new domain (such as honor relief variants) requires its own verified target adapter, not a fake system-asset record. Never bypass alpha, archive, permissions, or CAS checks. The workflow is manual and requires an approved archive copy before publishing.
