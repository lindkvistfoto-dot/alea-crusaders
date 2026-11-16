# Live/development split

Status: both environments are active and now diverge.

## Environment boundary

- Supabase live: `wbmosmkirsitkonejzpg`; Git branch `main` is the live release line.
- Supabase development: `wkiuyklzzroavclnsxna`; Git branch `development` is the working line.
- The initial database and Storage copy was one-way from live to development. There is no ongoing data sync.
- Both Supabase projects remain on the Free plan.
- GitHub Pages serves live at the root URL and development under `/dev/`. Changes pushed to `development` deploy automatically; changes to `main` require the manual combined Pages workflow.
- The initial copied app data remains in development. Do not sync development data back to live.

## Development database migrations

- Development has a schema-only baseline migration and a follow-up migration restoring the `auth.users` profile trigger.
- The old development migration SQL is preserved in `supabase/legacy-migrations/pre-baseline/`; it must not be replayed.
- The development database migration ledger contains the baseline and trigger migration. The expected profile trigger is present.
- New database changes belong in timestamped SQL files under `supabase/migrations/`.
- A guarded GitHub Actions workflow applies pending migrations only to the development project. It verifies the database hostname, checks a dry-run plan, and refuses to push unless the expected migration appears.

## Live release status

- No automatic live database migration workflow is configured. The existing live schema and migration history have not been changed by the development baseline work.
- Do not merge the development baseline migration into a live release or run the development migration workflow against live. The baseline describes the whole development schema and is not a forward migration for live.
- Because live still uses its original migration history while development starts from a snapshot baseline, the first schema release needs an explicit reconciliation plan. Until that is prepared, review and promote application-only changes separately from database changes.
- A live release remains an explicit decision by Daniel after reviewing the proposed PR and the exact database migration plan.

## Day-to-day workflow

1. Develop application and database changes on `development`.
2. Let the dev-only migration workflow apply and verify database changes there.
3. Before a release, identify the exact application commits and forward-only SQL changes intended for live. Keep the development baseline and archived historical files out of the live migration set.
4. Review the live PR and its dry-run plan before any production database change.
