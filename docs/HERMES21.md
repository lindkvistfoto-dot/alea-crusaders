# HERMES 2.1 – LOCKED CHAT → DRIVE → GITHUB TRANSPORT (2026-10-15)

## Proven result: STOPP
- User-supplied `ARCANE_IVORY_STOPP_original.png`, PNG RGBA 1254×1254, 2,678,163 bytes.
- SHA-256 `bc00be5e732aca25b78a7ff7c8cdceed07f097e922da73c13bb44fc05e5b3e49`.
- Private Google Drive TEMP INBOX: `/Google Drive/Alea Crusaders – HERMES 2.1 – TEMP INBOX/`.
- Drive folder ID: `1qyNO8FWuxNup50L1oTWTWsCVQ6L3_gdp`.
- Drive file ID: `1I6Wx2kTtVqN2l76cjwqvdOmN3_iLDY6C`.
- Downloaded Drive file back to the local container and verified byte-for-byte identity, including matching SHA-256.
- Read complete Base64 using connected Google Drive raw-file fetch; pushed to GitHub with `create_blob` `encoding="base64"`.
- Git blob SHA-1 `81a72afcd83f5467748ace750294b6a0e145a926`; matches independently computed Git blob digest from original bytes.
- Archived to `assets/hermes/originals/symbol/stopp/bc00be5e732aca25b78a7ff7c8cdceed07f097e922da73c13bb44fc05e5b3e49.png`, commit `1f70d78ec22b535963c09a08793605cbc87cf1f3`.
- Independently generated 640×640 WebP: 167,144 bytes, SHA-256 `de7b10aa1e2627afb3e681d0f19e1692f280960aa22ff8435965342faf61a170`, alpha preserved exactly after resize.
- Existing spell/symbol database record remains unchanged until the final secure publisher is implemented and verified.

## Mandatory chat-initiated transport protocol
1. Identify attached file's *actual* mounted path; validate signature, type, dimensions, alpha and source SHA-256.
2. Use project Files/Library's `manage_library` **upload** with `container_path` and `destination_path=/Google Drive/Alea Crusaders – HERMES 2.1 – TEMP INBOX/<asset-original.png>`. Do **not** assume the Google_Drive upload connector accepts a local path: it expects a connector file reference.
3. Verify via Google Drive folder listing. For robust proof, Files/Library `materialize` the Drive file into a new container path and compare its bytes to original with SHA-256.
4. Use Google Drive `fetch(download_raw_file=true, include_base64=true)` on the returned Drive file URL. Pass the returned complete `b64_string` **within the same function orchestration call** to GitHub `create_blob({content,encoding:"base64"})`. Never print millions of Base64 characters into chat or paste them manually.
5. Independently compute Git blob SHA-1 = SHA-1(`"blob " + byteLength + NUL + binaryBytes`) and require GitHub's returned SHA to match.
6. Read current branch head and base tree from GitHub Git API. Use `create_tree` with existing base tree, `create_commit`, `update_ref` without force. Archive under an immutable SHA-256 path. Never replace an existing unrelated blob and never force-push.
7. Recheck final committed GitHub blob SHA (not text decode); do not report success if commit update fails.
8. GitHub Actions `.github/workflows/hermes21-intake.yml` invokes `scripts/hermes2_prepare.py`. This validates original source SHA-256, produces optimized alpha-preserving WebP and attaches 7-day short-lived artifact. It is intentionally a preparation stage and is not allowed to mark Supabase entries active on its own.
9. Secure Supabase publishing is a separate unfinished milestone: immutable original+WebP Storage uploads, readback checksum, database compare-and-set, job logs, rollback. Retain the Drive file until confirmed successful, then delete after safety delay.
10. Never mix a successful GitHub binary transfer with "active in Alea" claims. Report each boundary separately.

## Milestone gate
- [x] Chat attachment → Drive without manual user intervention.
- [x] Download Drive → compare exact original SHA-256.
- [x] Drive Base64 → GitHub blob with independent Git SHA-1 matching.
- [x] Immutable original committed to GitHub main.
- [ ] GitHub Actions preparation job completes green and produces artifact.
- [ ] Trusted automated runner securely stages WebP to Supabase Storage.
- [ ] Database target `rule_magic_symbols.symbol_key=stopp` activated after readback, with the earlier icon preserved on failure.
- [ ] Three distinct chat attachments in a row with no manual steps.

## Security
This profile is exclusively for approved public game assets. Never send private files through GitHub public repositories. Do not expose storage/admin/GitHub tokens to chat, public GitHub commits or a Drive file shared publicly. The TEMP INBOX remains private. Prefer fine-grained delegated auth or short-lived OIDC when automating publication.
