# ALEA DEV authenticated admin test

This uses the existing Playwright and Supabase Auth path against an exact Cloudflare Pages DEV preview. The same permanent DEV account is reused across runs.

## One-time account setup

The existing account is `alea-dev-e2e@alea-crusaders.test` in the DEV Supabase project. The trusted admin-provision job will set its password from the GitHub secret, lift its Auth ban, and set the existing ALEA `profiles.is_admin` flag to true. It refuses to create or modify any other account.

Store these values as repository **Actions secrets** before provisioning:

- `ALEA_DEV_TEST_EMAIL` = `alea-dev-e2e@alea-crusaders.test`
- `ALEA_DEV_TEST_PASSWORD` = a unique password of at least 16 characters

The existing `ALEA_DEVELOPMENT_SUPABASE_SECRET_KEY` secret is also required by the one-time provisioning job. It must be the DEV Supabase secret key. Never pass it to Playwright or browser code.

To provision the account, merge a trusted PR targeting `development` whose description contains this exact marker:

```text
ALEA-DEV-ADMIN-PROVISION: YES
```

This one-time job uses Supabase Auth Admin API to set the existing account's password and clear its ban, then sets and verifies `profiles.is_admin=true`. It does not run during ordinary test executions. It adds no campaign membership: the current DEV RLS policies grant the admin profile campaign and game-data access through `private.is_admin()`.

## Run an authenticated DEV admin test

For a DEV preview PR, add this exact marker to its description:

```text
ALEA-DEV-PREVIEW: https://<exact-preview>.alea-crusaders.pages.dev
```

Merge the PR into `development`. The smoke job starts only on a **merged** PR targeting `development` with this marker. It does not run on ordinary open/update PR events and is not a reusable workflow that arbitrary PR jobs can invoke.

The runner validates the exact isolated Cloudflare preview hostname and confirms that the runtime backend is the DEV Supabase project. It signs in through the normal ALEA form, verifies the permanent admin flag and admin panel, then uses the authenticated app session to create a uniquely named temporary campaign and test character, update the character, and delete both. It reloads the page to confirm the same admin session remains active, then clears local storage and cookies and closes the isolated Playwright context. The report is retained as a seven-day Actions artifact; it does not include the credentials or a screenshot that could reveal the username.

For the first run, a merged trusted PR may include both markers; the smoke job waits for admin provisioning to finish. For the second run, use a separate merged DEV preview PR with only the preview marker. Both runs reuse the same account and leave no probe rows behind. Feature-specific HERMES or battle-pose acceptance remains a separate test with its own safety preflight.

## Security boundaries

- The account exists only in DEV; the workflow validates the DEV Supabase project and does not accept a LIVE URL.
- The test account is a permanent ALEA admin in DEV, as explicitly approved for this workflow. It has no LIVE identity.
- The Supabase secret key is available only to the merged-PR admin-provision job. Username/password secrets are available only to merged-PR DEV jobs. Open/update PR events do not receive them.
- The browser uses the normal email/password Auth flow; no service-role or secret key is passed into Chromium.
- No session state is saved as an artifact. Browser storage and cookies are cleared after each run.
- The temporary campaign and character names include a random suffix; the test verifies create/update and removes them in a `finally` cleanup path.

## Extend the test

Future Dockfabriken, HEXAGONIA, SL Control Board, combat, or HERMES ALEA tests may reuse the login and DEV backend guard. Keep test data isolated and clean it in a `finally` path. Do not add LIVE credentials or keys to these workflows.
