# API, Authentication, and Errors

## Route Handler Pattern

Admin Route Handlers under src/app/api/admin/** follow this shape:

1. Call getAuthenticatedEditor().
2. Return an error JSON envelope with 401 when absent.
3. Pass request JSON or parsed FormData to a mutation.
4. Return a named success envelope such as talent, event, archive, or result.
5. Catch validation/domain failures and return an error JSON envelope with 400.

Examples: src/app/api/admin/talents/[id]/route.ts, src/app/api/admin/archives/route.ts, and src/app/api/admin/ladder/route.ts.

Keep Route Handlers thin. Zod schemas and business rules belong in src/modules/admin/mutations.ts, not duplicated per POST/PUT route.

## Authentication and Sessions

src/lib/session.ts owns the session contract:

- passwords are verified with Argon2;
- a random raw token is sent only in the tianti_session cookie;
- only a SHA-256 token hash is persisted;
- the cookie is HTTP-only, sameSite lax, secure in production, path /, and expires after seven days;
- protected server layouts use requireAuthenticatedEditor() and redirect to /admin/login;
- API routes use getAuthenticatedEditor() and return 401.

SESSION_SECRET is currently declared only as an optional environment/template field; src/lib/session.ts does not consume it. Do not list it as a runtime requirement or imply that it signs cookies unless the session implementation is changed.

Never serialize EditorAccount, passwordHash, session tokens, or token hashes into public/service results. postgres-repository.ts::toEditorProfile() and tests/unit/content/service.test.ts are the reference boundary.

## Special Endpoints

- /api/auth/sign-in validates basic presence, distinguishes missing account/password failure with 401, then creates a session.
- /api/test/reset returns 404 unless TIANTI_E2E=1; never loosen this production guard.
- /api/cron/cleanup-orphan-assets requires the exact bearer value configured as CRON_SECRET. Missing server configuration is 500; wrong auth is 401.
- /api/admin/assets uses multipart upload and has an authenticated GET proxy for reopening an existing image.
- /api/uploads/presign is an authenticated legacy/alternate presign surface; the current InlineAssetUpload path posts to /api/admin/assets.

## Client Error Handling

Client components tolerate invalid/non-JSON responses by catching response.json(), checking response.ok, and falling back to a local Chinese error message.

Keep actionable messages near the relevant form. StatusNotice is the shared visual component; do not rely only on console output.

New response strings must remain valid UTF-8. The GET auth message in src/app/api/admin/assets/route.ts currently contains mojibake and is an example to fix, not copy.

Operational logging rules live in [Logging Guidelines](./logging-guidelines.md).

## Status-Code Expectations

| Condition | Status |
| --- | --- |
| Invalid/missing user input or domain invariant | 400 |
| Missing/invalid editor session | 401 |
| Hidden test endpoint outside E2E or missing asset | 404 |
| Missing cron server configuration or unexpected cron failure | 500 |

When adding a new error class/status, update both the route contract and the consuming client/test; do not silently change an existing envelope.
