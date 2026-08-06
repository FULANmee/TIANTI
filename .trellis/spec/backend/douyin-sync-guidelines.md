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
Event.origin = "manual" | "douyin_sync" | "douyin_merged"
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
- The existing Git-connected Vercel project uses root `vercel.json`: Next.js is mounted at `/` and the file-entrypoint FastAPI service at `/_internal/douyin-scraper`. The real `5.0` Preview proved `experimentalServices` is honored while project inspection still reports the existing `Next.js` Preset, so do not change the Preset solely for this integration. Do not create a second project or a nested `vercel.json`.
- Vercel generates server-side `DOUYIN_SCRAPER_URL` from the `douyin_scraper` service name. `DOUYIN_SCRAPER_URL_OVERRIDE` takes precedence only for local development or an approved external adapter. Plain HTTP is allowed only for a loopback local override; external adapters and deployed scraper ingress must use HTTPS. Never log Cookie, `ttwid`, bearer secrets, signed upstream URLs, raw upstream responses, or f2 trace output.
- Scraper responses are size-bounded. A related account is stored only from an authoritative `sec_user_id`/Douyin URL; `linkSource=unavailable` preserves prior verified related accounts. Nickname lookup is never a URL resolver.
- For a main profile, verified targets referenced by `@账号` are projected as `关联小号`; the product does not infer relationship direction from account metadata. Douyin `user.signature_extra[]` is the preferred authority when it contains a valid `sec_uid` plus `start`/`end` offsets into `signatureRaw`. Derive the nickname only from the exact `@昵称` slice—never trust a sibling `nickname`/`name` field to bypass the slice proof.
- Treat upstream signature offsets as either Unicode code-point indexes or UTF-16 code-unit indexes. Accept the entry only when the valid interpretations resolve to one unique, complete `@昵称`; reject malformed, surrogate-splitting, out-of-range, or conflicting interpretations. This structured path does not require Chromium.
- The parser keeps itinerary display text even when a date is invalid or missing, while invalid/ambiguous entries never reach reconciliation. Compact dates are accepted only next to a recognized city context.
- Only future `深圳` entries write activities. Compatible entries may aggregate only when the earliest-to-latest difference is at most five calendar days. Two different nonblank normalized names never merge; an unnamed entry joins a named group only when exactly one group is compatible.
- A successful empty snapshot advances a future entry's missing count. A fetch/validation/infrastructure failure does not. Remove a future automatic source only after two consecutive successful misses; past events and lineups are immutable to sync cleanup.
- A strict manual-event match may receive a `douyin:*` lineup, but sync never changes manual event fields. Admin edits convert an automatic event to `manual`. Removing or changing the talent/date identity of a source lineup suppresses the old schedule entry. A `douyin_merged` event is an editor-selected target whose name, venue, note, aliases, keywords, and slug remain editor-owned while sync updates only its date/status and source lineups.
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
| `signature_extra` offset is malformed or conflicting | Ignore that target; never fall back to an unproven sibling nickname |

### 5. Good / Base / Bad Cases

- Good: two talents publish `8.8深圳金铲铲`; one automatic activity is created with two source lineups.
- Base: `8.8深圳` creates an automatic activity with an empty persisted name; public UI derives a factual city/date display name.
- Good: `8.1深圳`, `8.6深圳`, and `8.11深圳` form two groups, never a transitive eleven-day group.
- Good: a main profile's `signature_extra` maps the exact `@望月水母.zip` slice to its authoritative `sec_uid`; return it as a verified small-account link with `linkSource=structured`.
- Bad: merging `8.8深圳金铲铲` with `8.8深圳和平精英`, guessing an `@nickname` URL, or treating a failed fetch as a missing itinerary.
- Bad: accepting `signature_extra.nickname` when its offsets do not slice a complete mention, or assuming Python string indexes always match upstream UTF-16 offsets.
- Bad: loading state before upstream fetches and replacing all source rows without rebasing/transaction guards; this resurrects an administrator's concurrent deletion.

### 6. Tests Required

- `tests/unit/douyin/itinerary.test.ts`: supplied bio grammar, invalid/missing dates, compact-number false positives, five-day diameter, named conflicts, and unnamed ambiguity.
- `tests/unit/douyin/sync.test.ts`: Shenzhen-only idempotency, strict manual match, two-success cleanup, failure preservation, past freeze, duplicate primary isolation, lineup dedupe, and suppression race.
- `tests/unit/douyin/profile-link.test.ts` and Python API tests: exact URL allowlist, auth, response limits, and safe errors.
- `services/douyin-scraper/tests/test_provider.py`: real `signature_extra` shape, strict slice proof, malformed offsets, primary-account exclusion, dedupe, non-BMP UTF-16 offsets, conflicting dual interpretations, and legacy non-`signature_extra` structured compatibility.
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

Wrong: recover a mention using nickname search or trust `signature_extra.nickname` without validating offsets. Correct: pair an authoritative `sec_uid` with the unique exact `@昵称` slice under code-point/UTF-16 interpretations, or accept a rendered Douyin `/user/<sec_user_id>` target; otherwise report `unavailable`.

## Scenario: Deployment-scoped Neon Preview migration safety

### 1. Scope / Trigger

Use this contract when a Vercel Preview uses the Neon integration's deployment action to clone a retained database that has business tables but no `drizzle.__drizzle_migrations` journal. The deployment-specific connection exists only during build/runtime; project-level Preview variables may still point at the same resource record as Production.

### 2. Signatures

~~~text
npm run build
  -> tsx scripts/apply-preview-v5-migrations.ts
  -> next build

Environment:
TIANTI_PREVIEW_V5_MIGRATIONS=1  # Preview branch 5.0 only
VERCEL_ENV=preview
VERCEL_TARGET_ENV=preview
VERCEL_GIT_COMMIT_REF=5.0
VERCEL_DEPLOYMENT_ID=dpl_*
DATABASE_URL=postgres(s)://...<ep-*.neon.tech>/...
~~~

Database identity and lock:

~~~sql
select pg_advisory_xact_lock(hashtext('tianti-preview-v5-migrations'));
select current_setting('neon.branch_id', true) as branch_id;
~~~

### 3. Contracts

- The migration command is inert unless the explicit feature flag equals `1`. If enabled, all Vercel environment/branch/deployment guards are mandatory before a Postgres client is constructed.
- The Neon branch ID must be nonempty, start with `br-`, and differ from the recorded Production branch `br-patient-dust-anwfalxy`. If the Production Neon project changes, update this identity and its tests before enabling the guard.
- Validate the `DATABASE_URL` without ever surfacing its raw value in thrown errors or logs. The host must be a Neon `ep-*` endpoint; success logs may contain only the endpoint ID and branch ID.
- Under one `sql.begin`, acquire the advisory transaction lock, classify the target schema as `fresh`, `legacy_complete`, `complete`, or `partial`, apply `0007`–`0009` for `fresh`, apply only the reviewed `0009` delta for `legacy_complete`, and verify `complete` before COMMIT.
- `legacy_complete` is the exact retained 0007/0008 shape: every old target table, column, primary key, foreign key, and index is present while every 0009 merge-rule object is absent. `complete` includes all target objects. Any other missing or mixed state is `partial`, which is fatal; do not repair it piecemeal.
- Never run `drizzle-kit migrate`, `db:seed`, or create/backfill the Drizzle journal on a retained clone without a trustworthy existing journal.
- Keep the build gate in the final Preview code: Neon may provision deployment/branch-specific credentials that cannot be recovered later with `vercel env pull`.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Flag absent or not `1` | Log `migration skipped`; never construct Postgres client |
| Production/non-Preview/non-`5.0`/local context | Fail build before database access |
| Missing, malformed, or non-Neon URL | Safe error without raw URL, userinfo, password, or query |
| Branch ID missing/malformed | Roll back and fail build |
| Branch ID equals Production | Roll back before schema snapshot/DDL |
| Base `events`/`talents` tables missing | `invalid_base`; roll back |
| No 5.0 objects | `fresh`; apply `0007` + `0008` + `0009` once |
| Exact 0007/0008 objects, no 0009 merge-rule objects | `legacy_complete`; apply only `0009` once |
| All expected objects present | `complete`; no-op |
| Any expected object missing or only a subset present | `partial`; roll back and fail closed |
| COMMIT/connection close fails | No success log; fail build |

### 5. Good / Base / Bad Cases

- Good: a fresh Preview branch `br-steep-band-anelimoy` differs from Production, starts with the retained schema, applies migrations `0007`–`0009` atomically, then renders the database-mode site.
- Upgrade: a retained Preview branch with the exact 0007/0008 shape applies only the reviewed 0009 delta atomically, then renders the database-mode site.
- Base: a redeploy on the same Preview branch reports `schema already complete` and performs no DDL.
- Bad: use the project-level Preview `DATABASE_URL` locally, assume it is isolated because the integration toggle is enabled, or run the whole migration history against a database with no journal.

### 6. Tests Required

- `tests/unit/scripts/apply-preview-v5-migrations.test.ts`: explicit flag and every Vercel context guard; Production branch constant; URL redaction; fresh/legacy-complete/complete/partial classification; exact tables, columns, PK/FK constraints, and indexes from `0007`–`0009`.
- `npm run build` with the migration flag absent must print `skipped` and complete without database access.
- Preview build logs must show a non-Production branch ID and `schema applied` or `schema already complete`, followed by a successful Next.js and Python Service build.
- Database-mode Preview smoke must prove sign-in/session across functions before enabling any sync write.

### 7. Wrong vs Correct

Wrong: pull the project Preview env locally and run the full migration journal.

~~~sh
vercel env pull .env.local --environment preview
npx drizzle-kit migrate
~~~

Correct: let the guarded Preview build use its deployment-scoped Neon URL, verify the branch identity, and apply only the reviewed delta inside one fail-closed transaction. Keep `DOUYIN_SYNC_ENABLED=false` except for the bounded manual verification window.

## Scenario: Editor-selected merged activities that remain sync-owned

### 1. Scope / Trigger

Use this contract when an editor merges two or more future activities that were created from different Shenzhen itinerary groups but wants later Douyin profile changes to keep updating one activity.

### 2. Signatures

~~~ts
POST /api/admin/events/bulk
{ action: "merge", ids: string[], targetId: string }
-> { result: {
  succeededIds: string[], blocked: [],
  mergedEvent: Event,
  mergedLineups: EventLineup[],
  mergedArchives: EditorArchive[]
} }
~~~

Database records:

~~~text
event_merge_rules(id, target_event_id, created_at, updated_at)
event_merge_rule_members(id, rule_id, source_entry_id, talent_id, city,
  normalized_name, starts_at, ends_at, last_seen_at)
~~~

### 3. Contracts

- The mutation requires at least two existing, future events and a target that is one of the selected IDs. It computes one target snapshot before calling the repository's atomic `mergeEvents()` transaction.
- The selected target keeps its name, slug, aliases, search keywords, city, venue, and note. Dates span the earliest selected start through the latest selected end; the result origin is `douyin_merged`.
- Lineups are deduplicated by talent plus lineup date, preferring `douyin:<scheduleEntryId>` sources so automatic updates remain attached; archives are merged per editor and deduplicated by talent, date, and cosplay title.
- Source schedule entries are reattached to the target, and a rule member snapshot records their last known identity. During future syncs, exact source IDs are preferred; changed activity names or dates may match only when the Shenzhen/talent/date candidate is unique within five days. Conflicting candidates are left to normal grouping instead of being forced together.
- A merge rule is never removed merely because a profile omits an itinerary for one or two successful syncs. Missing future sources lose only their automatic lineup after the existing two-success grace period; the target event and past records are retained.
- Completed/past activities are rejected as merge inputs so history is never deleted by this shortcut. Regular event deletion still removes the target rule through the repository/database cascade.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| fewer than two IDs | 400 with `请至少选择两个活动后再合并。` |
| target is absent or not selected | 400 with `请选择一个保留活动。` |
| an ID is missing | 400 with refresh/retry guidance; no writes |
| any selected event is past/undated | 400 with the completed-event protection message; no writes |
| repository transaction fails | whole merge rolls back; client keeps its prior live state |

### 5. Good / Base / Bad Cases

- Good: `8.8 深圳 金铲铲` and `8.8 深圳 和平精英` are manually merged; a later renamed `8.9` entry for each still points to the one target.
- Base: a source disappears from the profile; its historical member remains in the rule and the target is not deleted.
- Bad: deleting source activities one by one without reattaching schedule IDs, or letting sync overwrite the editor-selected target name with a new profile name.

### 6. Tests Required

- Mutation/repository tests assert target field preservation, date span, lineup/archive dedupe, schedule reattachment, rule creation, past-event rejection, and no state change on validation failure.
- Sync regression tests assert different named groups stay on one target after merge, changed names/dates update the same target, and missing sources never delete a merged or past event.
- `tests/e2e/smoke.spec.ts` asserts the radio target picker, warning, success refresh, and removal of the source from the admin list.

### 7. Wrong vs Correct

Wrong: treat a merged activity as an ordinary `manual` event or persist only the current event ID; the next sync recreates the split activities or loses automatic lineups.

Correct: persist `douyin_merged` plus `event_merge_rules`, reattach every selected schedule entry in one transaction, and let reconciliation update only dates/status/source-owned lineups while retaining editor-owned fields.
