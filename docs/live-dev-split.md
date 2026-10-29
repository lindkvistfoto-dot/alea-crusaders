# Live/development split — implementation notes

Status: in progress. Production data and the `main` branch have not been changed.

## Target

- `main` remains the live release branch; `development` is where new work is prepared.
- Live and development will use separate Supabase projects, Auth user pools, databases, Storage and Edge Function deployments.
- Create a one-time initial copy of the needed live data and assets into development, verify it, then let the two environments diverge. There must be no ongoing data sync between them.
- Promote code and reviewed database changes from development to live by pull request. Do not sync runtime data back to live.

## Verified status

- Repository: public `lindkvistfoto-dot/alea-crusaders`; GitHub Pages currently serves the live app. A development branch alone does not create a separate Pages URL.
- Branch history has diverged: `main` has 16 commits not on `development`, and `development` has 34 not on `main`. The application and migration files were identical in the earlier comparison; development has additional operational and documentation files. Do not reset either branch to the other.
- PR #354 added production-write guards to development workflows and was merged into `development` (commit `68ecf5115b1a563defe586a8b45d89278c5e1ea5`). It did not change `main`.
- The production Supabase project is `wbmosmkirsitkonejzpg`. The new project `alea-crusaders-development` (`wkiuyklzzroavclnsxna`) is empty and paused. It has no tables, migrations or Edge Functions. No live data has been copied.
- The frontend in `legacy/app.js` still hardcodes the production Supabase endpoint/key. Do not publish a development app until its configuration points only to the development project and fails closed if that configuration is missing.
- Live and `/dev/` on one hostname would share browser `localStorage`. Prefix all app-owned storage keys by environment before enabling the development route so sessions and local state stay separate.
- Migration history is not a safe replay source. The repository has 170 SQL migration files; production reported 171 applied. The last name comparison found 114 matching names, 56 repository-only and 57 live-only. There are duplicate migration version prefixes in the repository. Do not replay the old chain or mark migrations applied merely to silence drift.
- Production contains data that matters, including the rules/spell/skill infrastructure and some character/NPC data. Keep the initial copy broad until a table-by-table inventory proves what can be excluded. Map discovery can be reviewed separately.

## Free-plan constraint and initial copy

Supabase's current “Restore to a new project” guide says that feature requires a paid plan and physical backups. It is not available for this Free-plan split. It also does not copy Storage objects or Edge Functions. Do not enable a paid plan or physical-backup add-on for this project.

The no-upgrade path is a logical migration: capture the production schema and selected data, restore them into the empty development project, then separately transfer required Storage objects and configure Auth, API keys, and Edge Functions. Before running any import:

1. Inventory production tables, views, functions, triggers, RLS policies, extensions and Storage buckets. Identify scheduled or external side-effect jobs and disable or omit them from the dev copy.
2. Resolve the migration-history discrepancy by documenting the live schema as the baseline. Do not execute the old migration chain against the existing production database.
3. Prepare a repeatable export/import procedure and a recoverable local copy. Keep passwords, service-role keys and database URLs out of Git and artifacts.
4. Restore schema and data to the paused development project only after the procedure is reviewed. Verify important row counts, auth behavior, RLS, Storage references and app writes before making development available.
5. Keep the development project paused between work sessions if practical, and confirm Supabase displays no non-zero charge before any operation that could incur one.

A secure export/import may require Daniel to supply the production database password through a private local terminal or a one-time secret setup. Never paste it into chat, source files, logs, or a GitHub issue. If a workflow is used, it must be dry-run/report-first, target the development project explicitly, and never expose credentials in logs.

## Safe implementation order

1. Keep `main` and production untouched while work continues in `development`.
2. Finish a table/schema/Storage/Auth inventory and choose the logical copy mechanism that works on Free without exposing credentials.
3. Establish the live schema as a documented baseline; create a clean future migration strategy instead of replaying the mismatched history.
4. Copy into the paused development project, then verify the copy before unpausing it.
5. Add environment-specific frontend configuration. Browser code may contain only that project's URL and publishable key; never a service-role or secret key. Missing dev configuration must block database access rather than fall back to live.
6. Namespace browser storage by environment and verify the two environments cannot read each other's session or local data.
7. Prepare a GitHub Actions Pages deployment for live at `/` and development at `/dev/`. Switch Pages only after the workflow and both configurations are reviewed.
8. Promote by pull request from `development` to `main`. Review database changes separately and take a recoverable production backup/export before any production schema change. A release to production still requires Daniel's explicit release decision.
9. For production hotfixes, patch and deploy `main`, then merge the fix back into `development`.

## Daniel's actions

- For any command that needs a database password, enter it only in a private terminal or secret manager. Do not send it in chat.
- If Supabase displays any non-zero price for an operation, stop; this plan assumes Free.
- Approve production releases and production schema changes individually.

Normal Alea email/password login does not need OAuth or a shared service account. The two Supabase projects have separate Auth users and sessions; the same email can be registered in both with separate credentials. HERMES integrations that publish to Google Drive or GitHub are a separate service-account scope.
