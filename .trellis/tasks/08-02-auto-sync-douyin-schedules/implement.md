# TIANTI 5.0 抖音主页同步实施计划

## 1. Preflight and live-link extraction gate

- [ ] Obtain at least one public main-profile URL whose signature contains a clickable `@account`.
- [ ] Re-run the f2 profile probe at the pinned commit and record current success/error shape.
- [ ] Inspect rendered DOM/network data for an authoritative mention target.
- [ ] Decide and document the scraper link adapter: structured response first, conditional rendered DOM second.
- [ ] Update `research/f2-profile-spike.md` with the final extraction evidence before declaring the related-account feature complete.

## 2. Shared domain contracts and parser

- [ ] Add domain types for event origin, current Douyin profile state, related accounts, schedule entries and sync summaries.
- [ ] Implement primary Douyin-link detection/canonical validation.
- [ ] Implement a pure parser that returns display blocks plus structured entries without mutating source text.
- [ ] Implement Shanghai year/date validation and conservative yearless-date rules.
- [ ] Implement Shenzhen normalization and the fixed five-day aggregation algorithm.
- [ ] Add focused unit fixtures derived from the five user samples with contact data redacted.
- [ ] Test named conflicts, unnamed ambiguity, compact dates, ranges, past dates, invalid dates and duplicate sources.

## 3. Persistence and migration

- [ ] Extend event persistence with `origin`/manual-override semantics while keeping existing rows manual by default.
- [ ] Add current profile, related-account, schedule-entry, sync-run and sync-result tables with indexes/unique constraints.
- [ ] Add the reviewed Drizzle migration and metadata snapshot; do not edit prior migrations.
- [ ] Extend domain/ContentState or dedicated repository contracts without exposing sync logs publicly.
- [ ] Implement equivalent mock and Postgres reads/writes.
- [ ] Add transactional Postgres reconciliation where the event/source/lineup changes must be atomic.
- [ ] Update seed/fixtures with minimal synced and unsynced examples; never run destructive seed against retained data.

## 4. Incremental event and lineup reconciliation

- [ ] Add source-marker preservation to manual event saves.
- [ ] Implement strict manual-event match without changing manual fields.
- [ ] Implement sync-managed event create/reuse/split/merge within the fixed five-day diameter.
- [ ] Support empty names/venues only for sync-created events.
- [ ] Add source-tagged lineup upsert and unique/idempotent behavior.
- [ ] Detect manual removal/edits and suppress or convert ownership so sync does not undo user work.
- [ ] Implement two-consecutive-success future removal and sync-managed empty-event cleanup.
- [ ] Implement immutable past-event/lineup protection using shared Asia/Shanghai status helpers.

## 5. Python scraper service

- [ ] Scaffold `services/douyin-scraper/` with a Vercel file entrypoint, Python `pyproject.toml`, pinned dependencies and tests.
- [ ] Add Apache-2.0 attribution for f2 and record the pinned upstream commit.
- [ ] Implement strict Douyin URL validation and `sec_user_id` resolution.
- [ ] Wrap f2 user-profile fetching and map only signature/follower/account fields.
- [ ] Implement configured Cookie and generated visitor `ttwid` strategies without secret logging.
- [ ] Implement authoritative related-account extraction and conditional browser fallback when required by the preflight gate.
- [ ] Add bearer auth, typed responses, stable safe error codes, timeouts, bounded retry/jitter, concurrency and cooldown.
- [ ] Add health/readiness endpoints and unit tests with mocked upstream behavior.
- [ ] Validate the root-only `experimentalServices` config and smoke-test the FastAPI file entrypoint locally.

## 6. Website scraper client and sync orchestration

- [ ] Prefer Vercel's generated server-side `DOUYIN_SCRAPER_URL`, retain a validated local/external override, and document secret, enable, concurrency and cooldown settings.
- [ ] Implement a server-only typed scraper client with response validation, timeout and error mapping.
- [ ] Implement batch/single sync orchestration, run locking and idempotency keys.
- [ ] Persist successful current snapshots without clearing prior data on failures.
- [ ] Apply parser results and reconcile active future Shenzhen entries only after successful profile fetches.
- [ ] Record bounded per-run/per-talent results with secret-safe logging.

## 7. Routes, cron and admin workflow

- [ ] Add the authenticated daily cron route using the existing exact bearer convention.
- [ ] Add authenticated admin routes for all-talent and selected-talent sync.
- [ ] Add the daily schedule to `vercel.json` without disturbing orphan cleanup.
- [ ] Add global and per-talent “立即同步” controls with running, cooldown, success and error states.
- [ ] Keep client drafts/navigation guards intact and avoid duplicate submission.

## 8. Public read models and rendering

- [ ] Extend talent detail projection with follower count, itinerary display blocks and verified related accounts.
- [ ] Format the follower count in 万 units only on the talent detail page; omit public timestamps.
- [ ] Add a readable pre-wrapped itinerary section that preserves original source order/content.
- [ ] Add deduplicated safe external links for all verified `@accounts`, including “理想型” mentions.
- [ ] Add factual city/date fallbacks for unnamed events across cards, detail pages, metadata, search and related-event copy.
- [ ] Confirm homepage/talent cards/list/search do not gain follower-count UI.

## 9. Focused tests

- [ ] Parser/aggregation unit tests for every requirement sample and edge case.
- [ ] Admin mutation tests for empty-name boundaries, source preservation and manual protection.
- [ ] Repository/content-service tests for mock/Postgres parity and public credential/log isolation.
- [ ] Domain query tests for follower/detail projection, unnamed events and past freeze.
- [ ] Cron/auth/env tests for secrets, enable flags, locks and cooldown.
- [ ] E2E: manual sync test double -> talent detail follower/itinerary/accounts -> direct Shenzhen future event.
- [ ] E2E: failure leaves prior data; second successful absence removes future sync lineup; past activity remains.
- [ ] Responsive/accessibility review for long itinerary text and external-account links.

## 10. Quality and release validation

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit --types node,vitest/globals`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `npm run test:e2e:smoke`
- [ ] `npm run test:e2e`
- [ ] Scraper: `uv run pytest`
- [ ] Scraper: lint/type checks selected by its final toolchain.
- [ ] Scraper: file-entrypoint import plus local authenticated health/profile smoke.
- [ ] Vercel Services: validate current root config and verify one Git Preview builds both services from the same SHA.
- [ ] Verify mock mode and database mode separately; do not run destructive seed against retained content.

## 11. Deployment and rollback

- [x] Verify the existing Vercel project and current Next.js Preset honor root `experimentalServices`; do not create a second project.
- [ ] Configure Preview secrets/resources and apply the reviewed migration to the isolated Preview database before enabling sync writes.
- [ ] Push a Git branch Preview that deploys the Next.js and Python services together with sync/write flags disabled.
- [ ] Run a read-only production probe and inspect safe sync results.
- [ ] Enable controlled manual writes, verify public consequences, then enable daily cron.
- [ ] Record deployed Git SHA, Python dependency/runtime evidence and the two-service Vercel deployment evidence.
- [ ] Roll back by disabling sync/write flags; preserve schema, last successful snapshots and historical events.

## Risky files / rollback points

- `src/db/schema.ts` and new Drizzle migration: review defaults, FKs, unique indexes and backfill.
- `src/modules/domain/types.ts`: keep nullable/empty-name and public read-model boundaries explicit.
- `src/modules/repository/postgres-repository.ts`: reconciliation must be atomic and source-safe.
- `src/modules/admin/mutations.ts`: preserve current manual invariants while retaining sync sources.
- `src/modules/domain/queries.ts` and public event components: unnamed-event fallbacks must be consistent.
- `src/components/admin/talent-manager.tsx`: preserve drafts, cooldown state and unsaved-change behavior.
- `vercel.json` and environment parsing: sync stays disabled until scraper and migration are ready.
- `services/douyin-scraper/`: pin upstream f2 and keep secrets/redaction tests close to the adapter.
