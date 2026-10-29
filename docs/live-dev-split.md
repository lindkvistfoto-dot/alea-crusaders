# Live/development split — implementation notes

Status: preparation only. `main` and the live Supabase project remain unchanged.

## Target

- `main` remains the live release branch.
- `development` starts at the same Git commit as `main` and becomes the working branch.
- Live and development use separate Supabase projects, Auth user pools, databases, Storage and Edge Function deployments.
- Do not copy production player, account or campaign data into development. Add synthetic test data and explicitly selected static assets only.
- Promote code and reviewed database migrations from development to live. Do not sync runtime data back to live.

## Current inventory

- GitHub repository: public `lindkvistfoto-dot/alea-crusaders`; default branch is `main`. A new `development` branch has been created from `main`.
- The current Pages site serves the live app from the repository. A `development` branch by itself does not create a separate Pages URL.
- The frontend currently has a production Supabase endpoint configured directly in `legacy/app.js`. Do not publish development until configuration is environment-specific and fails closed if the development settings are missing.
- Live and `/dev/` on the same hostname share browser `localStorage`. The current app stores local state and a Supabase session there. Add an environment prefix to every app-owned storage key before enabling the development route; otherwise dev can read or overwrite live browser state.
- The repository contains 170 SQL migration files. The live database reports 171 applied migrations; only 115 names currently match, with 56 live-only and 55 repository-only names. Do not run the repo migration chain against either database until the mismatch is reconciled and a fresh-database baseline is verified.
- Production Storage is already in use. Avoid cloning it wholesale; use the minimum required static assets and respect the existing HERMES CORE asset workflow.

## Safe implementation order

1. Keep `main` and the live project untouched while working in `development`.
2. Daniel selects the Supabase organization for the new development project. Confirm the quoted cost before creating it if Supabase reports any non-zero charge.
3. Establish a reproducible schema baseline from reviewed SQL and reconcile migration history before applying migrations to development. Do not mark migrations applied simply to silence drift.
4. Add environment-specific frontend configuration for development and live. The browser may contain only that project's URL and publishable key; never a service-role or secret key. If dev configuration is absent, block database access rather than falling back to live.
5. Namespace all browser storage by environment and verify the two routes cannot read each other's session or local data.
6. Prepare a GitHub Actions Pages deployment that publishes the current live build at `/` and development at `/dev/`. Review and manually switch the Pages source only after the workflow and both configurations are ready.
7. Verify login, read/write, Storage and Edge Function boundaries in development. Confirm every endpoint points to the dev project.
8. Promote by pull request from `development` to `main`. Review migrations separately, take a manual production backup/export before any production schema change, and deploy production only after an explicit release decision.
9. For a production hotfix, patch `main`, deploy it, then merge `main` back into `development`.

## Daniel's critical actions

- Choose the Supabase organization for the development project. The connected account currently lists one organization named `Alea Crusaders`; confirm that this is where the project should live.
- If Supabase quotes a non-zero price, approve or decline it before project creation.
- At deployment time, approve switching GitHub Pages from its current source to the reviewed Actions workflow.
- At each production release, approve the PR and any production migration/deployment.

No OAuth or service account is needed for Alea's normal email/password login. The development Supabase project has its own Auth users and sessions; the same email can be registered there with a separate password. Treat HERMES integrations as a separate scope if they need development publishing or Google Drive access.
