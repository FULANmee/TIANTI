# Douyin Profile Sync Contract

## Scenario: Public-profile facts to source-owned activity records

### 1. Scope / Trigger

Use this contract whenever code changes Douyin profile fetching, itinerary parsing, automatic activity reconciliation, source-tagged lineups, related-account extraction, or a future capability such as live-state polling that reuses the scraper service.

The integration is deliberately split: the Python service returns public profile facts, while the Next.js application owns all TIANTI business rules and persistence. This prevents an upstream/f2 change from silently redefining activities.

### 2. Signatures

Internal scraper API:

~~~text
POST /v1/profiles/fetch
Authorization: Bearer ${SCRAPER_SHARED_SECRET}
{ requestId: string, profileUrl: HTTPS Douyin profile URL }
-> schemaVersion: 1
-> account: { secUserId, nickname, canonicalUrl }
-> profile: { signatureRaw, followerCount }
-> relatedAccounts[]
-> diagnostics.linkSource: structured | rendered | unavailable
~~~

Persistence port:

~~~ts
saveDouyinSyncState(input: DouyinSyncPersistenceInput): Promise<void>
tryStartDouyinSyncRun(run: DouyinSyncRun, staleBefore: string): Promise<boolean>
finishDouyinSyncRun(run: DouyinSyncRun, results: DouyinSyncResult[]): Promise<void>
suppressDouyinScheduleEntries(entryIds: string[]): Promise<void>
~~~

Source ownership:

~~~text
Event.origin = "manual" | "douyin_sync"
EventLineup.source = "" | `douyin:${scheduleEntryId}`
TalentDouyinScheduleEntry.state = active | removed_future | retained_past | suppressed
~~~

Environment keys:

~~~text
DOUYIN_SCRAPER_URL                 # generated server-side by Vercel service douyin_scraper
DOUYIN_SCRAPER_URL_OVERRIDE        # optional local/approved external override
SCRAPER_SHARED_SECRET
DOUYIN_SYNC_ENABLED
DOUYIN_SYNC_CONCURRENCY
DOUYIN_SYNC_COOLDOWN_MINUTES
DOUYIN_SYNC_TIMEOUT_SECONDS
CRON_SECRET
~~~

### 3. Contracts

- A talent is eligible only with exactly one valid saved link labeled `抖音`, `抖音主页`, or `douyin`. Direct URLs must exactly match HTTPS `/user/<id>`; approved short links use an exact `v.douyin.com/<code>` path. Reject userinfo, non-default ports, extra path segments, and non-Douyin hosts.
- The existing Git-connected Vercel project uses root `vercel.json` with Framework Preset `Services`: Next.js is mounted at `/` and the file-entrypoint FastAPI service at `/_internal/douyin-scraper`. Do not create a second project or a nested `vercel.json`.
- Vercel generates server-side `DOUYIN_SCRAPER_URL` from the `douyin_scraper` service name. `DOUYIN_SCRAPER_URL_OVERRIDE` takes precedence only for local development or an approved external adapter. Plain HTTP is allowed only for a loopback local override; external adapters and deployed scraper ingress must use HTTPS. Never log Cookie, `ttwid`, bearer secrets, signed upstream URLs, raw upstream responses, or f2 trace output.
- Scraper responses are size-bounded. A related account is stored only from an authoritative `sec_user_id`/Douyin URL; `linkSource=unavailable` preserves prior verified related accounts. Nickname lookup is never a URL resolver.
- The parser keeps itinerary display text even when a date is invalid or missing, while invalid/ambiguous entries never reach reconciliation. Compact dates are accepted only next to a recognized city context.
- Only future `深圳` entries write activities. Compatible entries may aggregate only when the earliest-to-latest difference is at most five calendar days. Two different nonblank normalized names never merge; an unnamed entry joins a named group only when exactly one group is compatible.
- A successful empty snapshot advances a future entry's missing count. A fetch/validation/infrastructure failure does not. Remove a future automatic source only after two consecutive successful misses; past events and lineups are immutable to sync cleanup.
- A strict manual-event match may receive a `douyin:*` lineup, but sync never changes manual event fields. Admin edits convert an automatic event to `manual`. Removing or changing the talent/date identity of a source lineup suppresses the old schedule entry.
- Fetches may take minutes. Re-read repository state before reconciliation, then preserve suppression/manual ownership again inside the final transaction. Postgres locks current schedule rows, automatic event updates use an origin guard, and cleanup deletes only still-automatic events with no lineups or archives. Mock behavior must match.
- `sec_user_id` is globally unique for primary profiles. A duplicate response fails only the conflicting talent result; it must not abort the batch transaction.
- The real rendered-mention path is not release-complete until a public main profile containing a clickable `@account` proves that the target Douyin URL/`sec_user_id` can be recovered. Until then, return `unavailable` rather than guessing.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Missing/ambiguous primary link | Per-talent `skipped`; no fetch or data clearing |
| Invalid host, scheme, port, or path | `INVALID_PROFILE_URL`; no upstream request |
| Fetch timeout/rate/auth/response failure | Safe failed result; keep last successful profile and missing counts |
| Invalid or missing itinerary date | Preserve display block; record skip; do not write activity |
| Non-Shenzhen or past itinerary | Detail-display only |
| Duplicate primary `sec_user_id` | Fail conflicting talent with `DUPLICATE_PRIMARY_ACCOUNT`; continue batch |
| First successful future absence | `consecutiveMissingCount=1`; keep lineup/event |
| Second successful future absence | Remove only its automatic lineup; delete only an empty, unclaimed automatic event |
| Admin suppression during a running fetch | Suppression wins; final save cannot recreate the lineup |
| Existing event was manually claimed | Do not update/delete its fields |
| Mention target cannot be verified | `linkSource=unavailable`; keep previous verified links |

### 5. Good / Base / Bad Cases

- Good: two talents publish `8.8深圳金铲铲`; one automatic activity is created with two source lineups.
- Base: `8.8深圳` creates an automatic activity with an empty persisted name; public UI derives a factual city/date display name.
- Good: `8.1深圳`, `8.6深圳`, and `8.11深圳` form two groups, never a transitive eleven-day group.
- Bad: merging `8.8深圳金铲铲` with `8.8深圳和平精英`, guessing an `@nickname` URL, or treating a failed fetch as a missing itinerary.
- Bad: loading state before upstream fetches and replacing all source rows without rebasing/transaction guards; this resurrects an administrator's concurrent deletion.

### 6. Tests Required

- `tests/unit/douyin/itinerary.test.ts`: supplied bio grammar, invalid/missing dates, compact-number false positives, five-day diameter, named conflicts, and unnamed ambiguity.
- `tests/unit/douyin/sync.test.ts`: Shenzhen-only idempotency, strict manual match, two-success cleanup, failure preservation, past freeze, duplicate primary isolation, lineup dedupe, and suppression race.
- `tests/unit/douyin/profile-link.test.ts` and Python API tests: exact URL allowlist, auth, response limits, and safe errors.
- `tests/unit/douyin/routes.test.ts`: editor auth and exact cron bearer behavior.
- Mutation tests: source preservation only when lineup talent/date identity is unchanged; otherwise suppression.
- Public projection tests: follower/detail-only visibility, itinerary ordering, verified related accounts, and unnamed-event fallback.
- Before release: Node 24 lint/typecheck/unit/build/Playwright, Python tests, current Vercel config validation, a two-service Git Preview from the same SHA, real Postgres migration/write smoke, and the real clickable-mention gate.
- The Python Playwright dependency does not prove Chromium is available in Vercel's Python runtime. Keep browser links disabled until Preview proves a compatible browser and system libraries can launch; otherwise the adapter must return `unavailable` without guessing.

### 7. Wrong vs Correct

Wrong: reconcile from the pre-fetch snapshot and blindly replace automatic rows.

~~~ts
const state = await repository.getState();
const snapshots = await fetchAll(state.talents);
await repository.saveDouyinSyncState(reconcile(state, snapshots));
~~~

Correct: rebase after network work and enforce ownership again in the persistence transaction.

~~~ts
const requestedState = await repository.getState();
const snapshots = await fetchAll(requestedState.talents);
const latestState = await repository.getState();
const input = reconcile(latestState, snapshots);
await repository.saveDouyinSyncState(input); // row lock + suppression/origin guards
~~~

Wrong: recover a mention using nickname search. Correct: accept only an authoritative response or rendered Douyin `/user/<sec_user_id>` target; otherwise report `unavailable`.
