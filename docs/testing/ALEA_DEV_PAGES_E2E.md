# ALEA DEV authenticated smoke test

This reuses the existing Playwright and Supabase Auth path to check a normal user login against an exact Cloudflare Pages DEV preview. It does not publish data or require an administrator account.

## One-time account and secrets setup

Create or reuse one normal email/password user in the DEV Supabase project only. Confirm the account's profile has `is_admin=false`, and do not add it to campaign membership or any privileged role. Do not create the same identity in LIVE.

Store these values as repository **Actions secrets**:

- `ALEA_DEV_TEST_EMAIL`
- `ALEA_DEV_TEST_PASSWORD`

Use a unique, long password. Do not put the credentials in workflow inputs, PR text, repository variables, fixtures, or logs. Rotate them by changing the DEV Auth password and updating the secret. To suspend access, disable the Auth user in DEV.

The runner only reads these secrets in the trusted post-merge workflow below. It does not call Supabase Admin APIs, change profile roles, create users, ban users, or grant campaign access. Browser login uses the normal ALEA sign-in form.

## Run against a DEV preview

Add this exact marker to a DEV PR description:

```text
ALEA-DEV-PREVIEW: https://<exact-preview>.alea-crusaders.pages.dev
```

Merge that PR into `development`. The workflow starts only on a **merged** PR targeting `development` with the marker. It does not run on ordinary open/update PR events, and it is not exposed as a reusable workflow callable by arbitrary PR jobs.

The runner validates the isolated Cloudflare preview hostname and checks that its runtime backend is the DEV Supabase project. It logs in through the real Pages UI, verifies an authenticated home view and that admin UI is unavailable, reloads to confirm the session persists, then clears browser storage and closes the isolated context. The report is retained as a seven-day Actions artifact and contains no credentials. A failure screenshot is intentionally not collected because the UI can display the test username.

## Security boundaries

- No LIVE URL or LIVE Supabase project is allowed.
- The permanent account has no admin flag or campaign membership.
- Username/password are read only by the post-merge DEV workflow; unmerged PR code never receives them.
- The browser receives only the account credentials for normal Supabase Auth. No service or secret key is passed to Playwright.
- No session state is saved as a persistent artifact; local storage, cookies, and the isolated browser context are cleared after each run.
- Future feature tests should use separate narrowly scoped accounts or fixtures where privileged access is genuinely required. Do not elevate this smoke-test identity.

## Extend the smoke test

Keep this runner limited to the basic authenticated DEV check. Feature acceptance tests for Dockfabriken, HEXAGONIA, SL Control Board, combat, and HERMES ALEA need their own explicit case, data-safety preflight, and narrowly scoped permissions. They may reuse the browser setup and backend guard, but should not add administrator rights to this account.
