# OLYMPIA DEV Decision Bridge

This function accepts Zeus decisions from OLYMPIA and records them as GitHub issues.
It is designed for the isolated ALEA development Supabase project only.

## Security contract

- Supabase verifies the caller's signed-in user; the function then enforces the exact, confirmed email in `OLYMPIA_ZEUS_EMAIL`.
- GitHub App private key and installation identity stay in Supabase Edge Function secrets.
- GitHub installation tokens are short-lived and requested only for this repository with Issues write and Contents read.
- Each decision is bound to the queue item's PR number and exact verified `dev_sha`. Stale versions fail with HTTP 409.
- Release choices require a prior OLYMPIA acceptance issue for the same item and exact DEV SHA.
- This function only records decisions. It has no LIVE deployment permission and cannot publish.

## DEV-only configuration

Configure these server-side secrets on the Supabase project `wkiuyklzzroavclnsxna`:

- `OLYMPIA_ZEUS_EMAIL`: Zeus's confirmed Supabase Auth email.
- `OLYMPIA_GITHUB_APP_ID`
- `OLYMPIA_GITHUB_INSTALLATION_ID`
- `OLYMPIA_GITHUB_APP_PRIVATE_KEY`: PEM private key; never place this value in the repository, Pages output, or browser.

The GitHub App must be installed on `lindkvistfoto-dot/alea-crusaders` and grant Issues read/write, Contents read, and Pull requests read/write. Pull request write is used only after Zeus separately approves an exact, tested candidate in OLYMPIA. Do not grant Actions, Deployments, Administration, or Contents write.

Deploy this folder to the DEV Supabase project with JWT verification enabled. The deployment workflow is triggered only by changes merged to `development` and targets the DEV project ref `wkiuyklzzroavclnsxna`. It requires the repository Actions secret `SUPABASE_ACCESS_TOKEN`.\n\nThe three `OLYMPIA_*` runtime values above must also be configured as Edge Function secrets in the DEV project before Zeus can submit decisions. The handler returns a clear 503 and performs no write while these are missing. Do not copy them into Pages, source files, or PR descriptions.
