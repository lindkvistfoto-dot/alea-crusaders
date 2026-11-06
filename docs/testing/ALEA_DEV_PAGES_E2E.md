# ALEA DEV Pages E2E

This is an isolated, reusable Playwright runner for an exact Cloudflare Pages preview and the existing DEV Supabase project. It uses normal email/password Supabase Auth in the real Pages UI.

## Trigger a preview test

For a DEV pull request, add one line to its description:

```text
ALEA-DEV-PREVIEW: https://<exact-preview>.alea-crusaders.pages.dev
```

Merge the PR into `development`. The workflow validates the preview hostname and the runtime Supabase project before it signs in. A call from another workflow can reuse `alea-dev-pages-e2e.yml` with its exact `preview_url` input and the `ALEA_DEVELOPMENT_SUPABASE_SECRET_KEY` secret.

The first implemented case is Evalin's inactive Lasso pose in Dockfabriken. It stops before writing unless the known DEV Lasso row is still an empty, inactive draft and Evalin's active Standard pose is present. It uses the existing transparent smoke fixture. It checks the UI publication, the HERMES ALEA job, private original and WebP read-backs against SHA-256, pose revision and state preservation, and Dockfabriken display after reload. Screenshots and a sanitized JSON report are retained as a seven-day Actions artifact. Browser context and ephemeral session are closed after each run.

The test identity is created or reused in DEV at run time, gets a fresh random password for that run, is granted only the existing DEV profile admin flag while the test runs, then is demoted and banned. No password, session file, or service key is written to the repository or passed to Chromium. The service key is used only by the isolated Node process for account lifecycle and read-back verification. Use the existing GitHub Actions secret `ALEA_DEVELOPMENT_SUPABASE_SECRET_KEY`; it must contain the DEV Supabase secret key, never a LIVE key.

## Archive requirement

A passing acceptance also requires `hermes_alea_jobs.archive_state=verified` and a Drive archive id/timestamp. The current archive worker is restricted to the existing trophy path and its workflow runs against LIVE. This test intentionally does not invoke it or share its Drive destination. Until a DEV-only archive consumer and destination can verify battle-pose jobs, the UI/Storage checks can pass but the overall acceptance reports failure at archive verification. Do not use the LIVE worker for a DEV test.

## Extending cases

Keep each future case as a separate Playwright test module selected by an explicit workflow input, with its own DEV-only fixtures and data safety preflight. The same authentication setup, runtime backend guard, screenshot/report handling, and cleanup should be reused for Dockfabriken, HEXAGONIA, SL Control Board, combat, and HERMES ALEA. Do not relax the preview allowlist or supply any production key.
