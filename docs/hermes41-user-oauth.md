# HERMES 4.1 — Private Google Drive OAuth onboarding

The dedicated Drive service account authenticated and could read the shared folder, but Google returned `storageQuotaExceeded` on upload. User OAuth is required for the personal Google Drive archive.

## Security and architecture
- Use the user's own Google OAuth consent; never place authorization codes, refresh tokens, or client secrets in GitHub commits, chat, or browser localStorage.
- Use a desktop OAuth client for one-time local authorization with PKCE and loopback redirect. The resulting refresh token must be transferred directly to GitHub Actions Secrets through the authenticated GitHub UI or a trusted local credential helper, not pasted into chat.
- OAuth scope `drive.file` is preferred, but does not grant blanket access to an existing Drive folder. The archive folder must be explicitly selected/authorized using Google Picker or the app must create a dedicated folder. Validate the chosen folder before enabling publication.
- External apps in Testing mode normally issue 7-day refresh tokens for Drive scopes. Do not enable unattended production until consent status and token longevity are resolved.
- Secrets: `HERMES_OAUTH_CLIENT_ID`, `HERMES_OAUTH_CLIENT_SECRET`, `HERMES_OAUTH_REFRESH_TOKEN`; server-side only.
- The original must be verified in Google Drive by SHA-256 readback before WebP publication.
- Do not merge/enable the worker until OAuth folder access, end-to-end staging-to-archive-to-publication and retry behavior are verified.

## Current state
OAuth client created by owner; `drive.file` added; owner registered as test user. User authorization and archive-folder access are NOT yet complete.
