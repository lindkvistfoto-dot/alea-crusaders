# ARCANE HONORS — implementation contract (phase 1)

Status: proposed, not implemented. Do not expose as a live feature until DB, UI and tests are integrated.

## Product
- Admin entry: ARCANE HONORS, with Awards, Recipients, Rules tabs.
- Character page: compact right-side award showcase; click opens full character gallery.
- Full gallery: character switcher, earned, visible-unearned, secret (no spoilers), award detail and award history.
- Honors are cosmetic only. No stat/skill/combat effects.

## Data model
- honor_definitions: id, stable_key, name, type (adventure/campaign/achievement/honor), description, requirement_text, visibility (public/silhouette/secret), grant_mode (manual/automatic/both), status (draft/active/inactive), image_asset_id, adventure_id nullable, campaign_id nullable, created_by, timestamps.
- honor_grants: id, honor_id, character_id, granted_at, granted_by, source_event_id nullable, reason nullable, revoked_at nullable, revoked_by nullable, revocation_reason nullable.
- honor_rule_definitions: id, honor_id, event_type, condition_json, threshold, enabled, scope and version.
- honor_event_progress: rule_id, character_id, count, last_event_id, timestamps.
- honor_packages: id, name, scope, version; honor_package_items links package and definition.
- unique idempotency key for event-based grants, prevent duplicate grants from replay/retry; manually granted/revoked records remain auditable.
- Validate character, campaign and adventure references against existing Alea schema before migrations.

## Admin requirements
- Search, filter, create, edit, deactivate definitions; view image and transparency QA status.
- Award detail shows recipients, dates, source, reason and revocation history.
- Manual multi-character grants with confirmation and authorization checks.
- GM permissions for campaign-scoped awards; central admin for system definitions. Character owners can read only eligible awards and their own grants.
- Secret definitions must not leak names, requirements, image URLs or counts to unauthorized clients.
- Never hard-delete granted awards. Preserve historical definition snapshots if a package changes.

## Event engine (phase 2)
- Begin with first perfect roll, and expandable counters for other events.
- Reuse authoritative server-side event stream if available; never trust client-reported perfect rolls.
- Ensure idempotency, concurrency safety, and no accidental historical retroactive awards.
- Rule activation and backfill are separate, explicitly approved operations.

## Images
- HERMES 4.0: Drive Inbox -> Drive Archive (original) -> optimized transparent WebP -> Supabase publication.
- Verify real alpha channel, not checkerboard baked into pixels. Asset association is by stable resource ID.
- Adventure medals can have unique form, material, relief and short military-style ribbon.

## Acceptance gates
1. Existing schema and admin routes inventoried; no assumptions about table or component names.
2. Migrations, RLS, UI, event hooks, tests in separate reviewable changes.
3. Tests: permission boundaries, hidden spoilers, grant/revoke audit, duplicate event, character switcher, alpha asset fallback.
4. Build and tests pass before requesting merge.
