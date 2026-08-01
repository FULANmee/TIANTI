# Logging Guidelines

## Current Contract

There is no project logging framework, request logger, or structured-log schema. Server logging is deliberately sparse:

- src/app/api/cron/cleanup-orphan-assets/route.ts logs unexpected cleanup failures with console.error;
- scripts/seed.ts prints a final aggregate JSON object or the thrown error.

Do not invent log levels or add noisy request logging as if a convention already existed. For a new operational failure that cannot be expressed only through the response, log a stable action label plus the error and keep the HTTP response client-safe.

## Sensitive Data

Never log:

- passwords or password hashes;
- cookies, raw session tokens, token hashes, or CRON_SECRET;
- R2 access/secret keys or DATABASE_URL;
- complete uploaded image bytes, blobs, or data URLs;
- full admin payloads when an entity ID and targeted error are sufficient.

## Review

- Expected validation/auth failures normally return their HTTP envelope without server error noise.
- Unexpected cron/storage/database failures may be logged once at their owning boundary.
- Client-facing messages stay in valid UTF-8 and do not expose internal stack/configuration details.
- Tests should not depend on incidental console output unless logging itself becomes an explicit contract.

See [API, Authentication, and Errors](./error-handling.md) for route envelopes and status codes.
