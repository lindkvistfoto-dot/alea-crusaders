# Live/development split

Status: initial development copy is in place; the two environments now diverge.

## Environment boundary

- Supabase live: `wbmosmkirsitkonejzpg`; branch `main` is the live release line.
- Supabase development: `wkiuyklzzroavclnsxna`; branch `development` is the working line.
- The initial database and Storage copy is one-way, live to development. There is no ongoing data sync.
- Development changes must never target the live project by fallback. A production release requires a reviewed PR and Daniel's explicit release decision.
- Both projects remain on the Supabase Free plan.

## Verified migration state

- The development database contains the copied application tables and data, but its Supabase migration ledger is empty.
- The repository's old migration chain diverged from live and contains duplicate version prefixes. It must not be replayed.
- This baseline workflow captures the current development schema only, keeps the old SQL files under `supabase/legacy-migrations/pre-baseline/`, and opens a PR to `development`.
- The workflow does not update the development migration ledger. After the PR is merged, the development deploy workflow records the baseline as applied, checks the pending migration plan, and applies the small missing auth profile trigger.
- Live database, migration history, and Storage are not changed by this process.

## Day-to-day workflow

1. Develop application and database changes on `development`.
2. Put every future database change in a new timestamped file under `supabase/migrations/`.
3. Review the PR and development deployment result before promoting code to `main`.
4. Keep production data out of development after this initial copy; never sync development data back to live.

The frontend deployment split and environment-specific browser storage still need separate implementation before a public `/dev/` app is enabled.
