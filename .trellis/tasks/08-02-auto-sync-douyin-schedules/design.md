# TIANTI 5.0 抖音主页同步技术设计

## 1. 目标与边界

TIANTI 5.0 在现有 Git-connected Vercel 项目中增加一个独立 Python 抖音主页抓取 Service，并由现有 Next.js Service 负责定时编排、简介解析、深圳活动聚合、数据写入和公开展示。两个 runtime 来自同一 Git SHA 和同一个 Preview/Production deployment，不创建第二个项目。

抓取服务只返回主页事实，不拥有 TIANTI 的业务规则；网站不直接依赖抖音私有端点或 f2 内部类型。这样未来增加开播提醒或替换 f2 时，可以扩展抓取能力而不改写活动领域模型。

~~~text
Vercel Cron / admin manual trigger
  -> authenticated website sync route
     -> due talents with one primary Douyin link
     -> Python scraper service (versioned internal API)
        -> URL -> sec_user_id
        -> f2 user profile endpoint + visitor/configured Cookie
        -> optional rendered-DOM mention extraction
     <- raw signature + follower count + verified @account targets
     -> deterministic itinerary parser
     -> current profile/schedule state + sync audit
     -> Shenzhen-only reconciliation
        -> strict manual-event match OR sync-managed event
        -> incremental source-tagged lineups
     -> existing public query/read-model flow
~~~

Out of the Python service:

- activity parsing, city filtering and date inference;
- event matching, grouping, writes and cleanup;
- public/admin read models;
- TIANTI database credentials.

Out of 5.0:

- video/post/live collection;
- live alerts;
- follower history/trends;
- non-Shenzhen activity writes.

## 2. Scraper service

### Runtime and packaging

- Add a separately built service under `services/douyin-scraper/` in the existing Vercel project.
- Root `vercel.json` is the only Vercel manifest. It uses `experimentalServices` with Next.js at `/` and the Python file entrypoint `services/douyin-scraper/main.py` at `/_internal/douyin-scraper`; the dashboard Framework Preset must be `Services`.
- Keep dependencies in the scraper directory's `pyproject.toml`; the root `main.py` exports the FastAPI `app` and imports the existing `app` package. The service requires Python `>=3.12,<3.13`, matching the current Vercel Python runtime helper.
- Pin the audited f2 commit `7dab3e2ffffaa2535834d28fca99dbc2e89fa9d3`; record Apache-2.0 attribution and notices.
- Do not import scraper code into Next.js or deploy it in the Node runtime.
- Browser rendering is an optional adapter used only when the raw signature contains `@` and structured link targets are unavailable. The Python Playwright package does not guarantee Chromium/system-library availability on Vercel; keep the adapter disabled until a Preview runtime probe proves it can launch.

### Authentication and secret handling

- Require `Authorization: Bearer ${SCRAPER_SHARED_SECRET}`.
- Accept requests only over HTTPS in deployed environments.
- Never log Cookie, `ttwid`, full signed URLs, bearer secrets or raw upstream response bodies.
- Cookie strategy: configured `DOUYIN_COOKIE` when present, otherwise a generated/cached visitor `ttwid`; invalidate and regenerate visitor state on recognized auth/frequency failures.
- Keep request concurrency low and bounded; add timeout, retry with jitter and an explicit circuit-breaker/cooldown for rate limiting.

### Versioned internal contract

`POST /v1/profiles/fetch`

Request:

~~~json
{
  "requestId": "uuid",
  "profileUrl": "https://www.douyin.com/user/..."
}
~~~

Success response:

~~~json
{
  "schemaVersion": 1,
  "fetchedAt": "2026-08-04T04:00:00.000Z",
  "account": {
    "secUserId": "...",
    "nickname": "...",
    "canonicalUrl": "https://www.douyin.com/user/..."
  },
  "profile": {
    "signatureRaw": "...",
    "followerCount": 126438
  },
  "relatedAccounts": [
    {
      "nickname": "...",
      "secUserId": "...",
      "url": "https://www.douyin.com/user/..."
    }
  ],
  "diagnostics": {
    "profileSource": "f2-user-detail",
    "linkSource": "structured|rendered|unavailable"
  }
}
~~~

Error response uses a stable code and retryability flag, for example:

- `INVALID_PROFILE_URL` — permanent;
- `PROFILE_NOT_FOUND_OR_PRIVATE` — permanent until URL changes;
- `COOKIE_REJECTED` — retryable after rotation;
- `RATE_LIMITED` — retryable after cooldown;
- `UPSTREAM_EMPTY_RESPONSE` — retryable;
- `LINK_EXTRACTION_UNAVAILABLE` — profile data may still succeed, but prior verified related-account links are not cleared;
- `INTERNAL_ERROR` — retryable with bounded attempts.

### Mention-link extraction gate

The f2 user detail response exposes the raw `signature` and `follower_count` but no verified `@account` target in the tested response. Before the small-account feature is considered complete:

1. test a main profile whose rendered intro contains a clickable `@account`;
2. inspect rendered DOM and relevant network responses;
3. implement extraction from an authoritative target URL/`sec_user_id` only;
4. if no target can be recovered, return `linkSource=unavailable` and do not guess by nickname.

## 3. Domain and persistence model

### Event compatibility fields

Add an event ownership marker:

~~~ts
type EventOrigin = "manual" | "douyin_sync";
~~~

- Existing and manually created events default to `manual`.
- Automatically created events use `douyin_sync`.
- Any successful admin edit of a sync-created event converts it to `manual`; future sync may still maintain its source-tagged lineups but may not alter/delete event fields.
- Event `name` stays a string at the domain boundary, but an empty string is valid only for sync-created events. The manual mutation remains name-required.

### Current profile state

Add `talent_douyin_profiles`, one row per talent:

- `talent_id` primary key / cascading FK;
- primary profile URL and canonical `sec_user_id`;
- raw signature;
- extracted itinerary text/blocks for the current successful snapshot;
- follower count;
- `fetched_at`, `last_success_at`;
- last scraper/link-extraction status and safe error code;
- manual-sync cooldown timestamp;
- parser version.

The raw upstream JSON and Cookie are never persisted.

### Related accounts

Add `talent_douyin_related_accounts`:

- stable ID, talent ID, related `sec_user_id`, nickname, canonical URL, sort order;
- unique by `(talent_id, sec_user_id)`;
- replace/diff only after link extraction succeeds authoritatively;
- dedupe the primary profile and repeated mentions.

### Schedule source state

Add `talent_douyin_schedule_entries`:

- stable source ID and talent ID;
- source fingerprint, parser version and raw source segment;
- parsed start/end date, city and optional activity name;
- mapped event ID;
- first/last seen timestamps;
- consecutive successful-missing count;
- state: `active`, `removed_future`, or `retained_past`.

Fingerprint input is the stable normalized business identity, not the entire raw bio:

~~~text
talentId | date range | normalized city | normalized optional activity name
~~~

### Sync audit

Add `douyin_sync_runs` and bounded per-talent results:

- trigger `cron|manual_all|manual_talent`;
- status and started/finished timestamps;
- requested/succeeded/skipped/failed counts;
- per-talent safe error code, retryability and action summary;
- retention policy so logs do not grow without bound.

No raw Cookie or signed upstream URL may enter the audit tables.

### Lineup source contract

Use the existing `event_lineup.source` to retain an opaque `douyin:<scheduleEntryId>` marker.

- Manual save preserves the source of an existing lineup ID instead of normalizing every existing row to blank.
- New manual lineups remain source blank.
- Removing a source-tagged future lineup in the admin UI suppresses/retires that schedule entry so the next sync does not immediately recreate the manual deletion.
- Sync writes add/update/remove only source-tagged rows; they never replace the entire event lineup.

Repository contract and mappings must remain equivalent in mock and Postgres modes.

## 4. Primary Douyin profile selection

- A talent is sync-eligible when exactly one saved platform link has a `douyin.com` host and a normalized label identifying it as the primary “抖音” link.
- Missing or ambiguous primary links are skipped with an admin-visible reason.
- Related accounts discovered from the signature are stored separately and never become the talent's primary sync target.
- Profile URLs and redirects are canonicalized by the scraper; the website stores the resulting `sec_user_id` to keep identity stable when the URL presentation changes.

## 5. Itinerary parsing

### Preservation and parsing views

Maintain two views of the same signature:

1. **display view** — exact itinerary-related source text in original order, punctuation and wording;
2. **normalized parse view** — Unicode normalization and whitespace/token processing used only for detection.

The public detail page renders the display view with safe escaping and `white-space: pre-wrap`. It may split distinct source blocks into cards or visually emphasize date tokens, but must not rewrite the text.

### Supported sample grammar

The deterministic parser covers:

- labeled blocks: `行程：`, `签售行程：`, `线下行程：`;
- unlabeled date-led lines;
- separators: whitespace, `/`, `➡️`, and newlines;
- single dates: `8.7`, `8.8号`;
- compact dates such as `815成都`, only when the 3/4 digit token forms a valid month/day and is adjacent to a recognized city/context;
- date ranges such as `4.23-26`;
- optional city, activity label and parenthetical note.

Phone numbers, QQ/WeChat numbers and unrelated numeric text are excluded by token length, valid calendar checks and itinerary context.

### Year and time rules

- Parse relative to the Asia/Shanghai calendar day.
- Explicit years are honored.
- Yearless dates map to the current Shanghai calendar year for 5.0.
- A yearless date already earlier than today remains display-only and is never rolled into next year automatically.
- Invalid or ambiguous dates remain in display text and receive a skip reason; they never write an activity.

### Shenzhen write filter

- Normalize recognized city aliases to `深圳`.
- Only entries with a valid future date and explicit normalized city `深圳` enter reconciliation.
- Every non-Shenzhen entry remains visible in the talent detail itinerary text but never reaches event writes.

## 6. Shenzhen aggregation and matching

### Name compatibility

Normalize names with Unicode NFKC, case folding, outer punctuation/whitespace removal and internal whitespace collapse.

- Two non-empty unequal normalized names conflict and must be separate events.
- Equal non-empty names are compatible.
- An empty name is compatible only when it maps unambiguously to at most one named cluster; if multiple conflicting named clusters share the window, keep the unnamed entry in its own unnamed cluster.

### Fixed five-day window

- Sort future Shenzhen entries deterministically by date, normalized name and stable source ID.
- The difference between a group's earliest and latest calendar date must be at most 5 days.
- Do not use transitive adjacency to expand beyond that fixed diameter.
- Create multi-day event bounds from the earliest and latest source dates. Each talent lineup retains its actual lineup date.

### Stable reconciliation

- Reconcile active source entries as a set after a batch, not by whichever talent happens to finish first.
- Prefer the previously mapped sync-managed event when the resulting group is still compatible.
- When groups split/merge, change only future `douyin_sync` events and source-tagged lineups.
- Never mutate or delete an event that has become manual or past.

### Strict manual-event match

A source group may reuse a manual event only when:

- city normalizes to Shenzhen;
- date ranges overlap;
- names are compatible;
- exactly one manual event satisfies the rule.

Reuse adds only source-tagged lineups. It never modifies the manual event's name, dates, venue or note. Zero or multiple strict matches cause creation/reuse of a separate sync-managed event.

### Empty event names

- Auto-created events may store `name=""` and `venue=""`.
- Public event UI uses the date and city as the primary readable content when the name is empty; it does not invent “待确认活动” or another placeholder title.
- Slug/path logic falls back to the existing ID behavior.
- Search and metadata omit the empty name and use factual city/date copy.
- Manual create/edit continues to require a non-empty name.

## 7. Synchronization lifecycle

### Successful profile sync

1. Fetch and validate the scraper response.
2. Persist current signature/follower data and authoritative related accounts.
3. Parse and persist current itinerary display text and structured entries.
4. Mark currently seen source entries active and reset their missing count.
5. For prior future entries absent from this successful parse, increment missing count.
6. Freeze past entries as `retained_past`.
7. Reconcile all active future Shenzhen source entries into events/lineups in one repository operation/transaction where supported.

### Failure handling

- Scraper, network, auth, rate-limit, invalid-response or parser infrastructure failures do not clear profile data and do not increment missing counts.
- A single talent failure does not abort other talent syncs.
- Retries are bounded; safe error codes reach the admin status UI.

### Two-success future cleanup

- First consecutive successful snapshot missing a future source: retain it with missing count 1.
- Second consecutive successful snapshot still missing it: mark `removed_future` and remove only its source-tagged lineup.
- If a future sync-managed event has no lineups and was never manually edited, it may be deleted.
- Manual events, manual lineups and any event that is already past are never auto-deleted.

### Past freeze

Use existing Asia/Shanghai date-derived event status. Once an event is past:

- do not remove its historical source-tagged lineup;
- do not shorten dates or clear name/location;
- do not delete it even if the bio no longer contains the schedule;
- preserve source/audit linkage for traceability.

### Scheduling and idempotency

- Add one daily Vercel Cron route.
- Add admin-triggered all-talent and single-talent sync.
- Persist a run lock/idempotency key so overlapping cron/manual calls do not duplicate work.
- Bound concurrency and enforce per-talent manual cooldown.
- Reconciliation uses unique source fingerprints and source markers; rerunning the same successful snapshot is a no-op apart from timestamps/audit.

## 8. Website API and UI

### Routes

- `GET /api/cron/sync-douyin-profiles` — exact `CRON_SECRET` bearer contract, daily batch.
- `POST /api/admin/douyin-sync` — authenticated manual all-talent sync.
- `POST /api/admin/talents/[id]/douyin-sync` — authenticated single-talent sync with cooldown.

Keep routes thin; orchestration, parsing and writes belong to dedicated modules.

### Admin

Extend the talent workspace with:

- global “立即同步抖音” action;
- selected-talent “立即同步” action;
- last success/error state and safe failure reason;
- batch progress/result summary;
- disabled/cooldown/running states that prevent duplicate submission.

No candidate-review UI exists in 5.0.

### Public talent detail

Add to the talent detail read model:

- compact follower count;
- current itinerary display blocks;
- verified related Douyin accounts.

Render:

- follower count only on the detail page, formatted in 万 units (for example `12.6 万`), with no public timestamp;
- itinerary blocks in a high-readability, pre-wrapped section preserving original content;
- related accounts as safe external links.

Do not add follower counts to homepage, talent cards or public list/search cards.

## 9. Security, privacy and operations

- Treat signature text and scraper JSON as untrusted input; React escapes text, URLs are validated/canonicalized and only HTTPS Douyin user URLs are accepted.
- Do not persist or display business phone numbers, QQ/WeChat identifiers or unrelated bio text as itinerary data.
- SSRF protection: scraper accepts only exact approved Douyin hosts and URL shapes; it never fetches arbitrary user-supplied hosts.
- Limit response sizes and signature length.
- Redact secrets, cookies, signed URLs and raw upstream bodies from logs.
- The Vercel service name `douyin_scraper` generates server-side `DOUYIN_SCRAPER_URL` including its route prefix. Configure `SCRAPER_SHARED_SECRET`, optional `DOUYIN_COOKIE`, enable/write flags, concurrency and cooldown in the existing Vercel project. `DOUYIN_SCRAPER_URL_OVERRIDE` is only for local Uvicorn or an approved external HTTPS adapter.
- Add health/readiness endpoints for the scraper without upstream requests.

## 10. Rollout and rollback

1. Set the existing Vercel project's Framework Preset to `Services`; do not create a second project.
2. Configure Preview-scoped secrets/resources, keep sync disabled, and apply the migration to the isolated Preview database.
3. Push the Git branch so the same Preview SHA builds both Next.js and Python services.
4. Validate the Python health/internal auth path and run a read-only probe against selected public profiles; verify fields, rate limits and parser output.
5. Prove Chromium availability plus authoritative mention extraction before enabling browser links.
6. Enable manual write for a controlled run, then daily cron. Repeat the staged migration/environment checks before Production.

Rollback:

- disable cron/manual writes through environment flags;
- keep last successful profile and historical activity data visible;
- do not destructively roll back the migration;
- fix/redeploy the adapter or parser, then resume idempotently.

## 11. Verification strategy

- Parser unit tests use the five supplied samples with unrelated contact data redacted.
- Aggregation tests cover same date, fixed five-day diameter, named conflicts, unnamed ambiguity and stable reruns.
- Mutation/repository tests cover source preservation, manual-event reuse, manual overrides, two-success cleanup and past freeze.
- Scraper tests mock f2/upstream responses; live Douyin probes are manual/operational, never required in deterministic CI.
- E2E covers admin manual sync -> public talent detail/future event, including empty event names.
- Verify mock and Postgres mappings, date semantics, responsive detail layout, accessible external links and failure states.

## 12. Deferred technical item

The only deferred technical discovery is the authoritative extraction of `@account` targets from a main profile that actually contains clickable mentions. The Vercel Python runtime must also prove it has a compatible Chromium binary and system libraries; installing the Python Playwright package alone is insufficient. This does not change the website contract or 5.0 behavior: links are shown only when their true Douyin target is verified, never guessed.
