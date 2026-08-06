# Domain and Mutation Contracts

## Contract Owners

- Persisted/domain shapes: src/modules/domain/types.ts
- Pure reads and derived models: src/modules/domain/queries.ts
- Validated writes and invariants: src/modules/admin/mutations.ts
- Shared date semantics: src/lib/date.ts
- Route identity: src/lib/public-path.ts

Do not infer current behavior from removed version reports. The contracts below are exercised by tests/unit/admin/mutations.test.ts, tests/unit/domain/queries.test.ts, and Playwright smoke tests.

## Dates and Event Status

- Admin date inputs are yyyy-MM-dd.
- toDateOnlyIso() accepts only real calendar dates in exact yyyy-MM-dd form and stores them at 12:00 UTC to avoid boundary drift.
- Day comparisons use date keys, not arbitrary timestamp equality.
- Public filters, summary status, timelines, and detail badges derive future/past from the end date, falling back to the start date, relative to the Asia/Shanghai day.
- Missing both dates yields undated in read models.
- saveEvent() writes a compatible stored status from dates; callers must not treat payload status as authoritative when dates exist.
- Related-event copy, sitemap cadence, and other public temporal behavior use the shared derived status even when the stored compatibility field is stale.

For multi-day events:

- each lineup requires a date inside the event range;
- each archive entry requires a date inside the range;
- an archive entry's date must match one of that talent's saved lineup dates.

Reference implementations: getDateRangeDays(), saveEvent(), saveArchive(), buildLineupGroups(), and buildArchiveEntryGroups().

## Scenario: Strict Date-Only and Event Bulk Contracts

### 1. Scope / Trigger

Use this contract whenever an admin write accepts an event, lineup, or archive date, or when code constructs an event bulk payload. It prevents JavaScript date rollover and compile-time actions that the runtime handler cannot execute.

### 2. Signatures

~~~ts
toDateOnlyIso(value?: string | null): string | null
isValidDateOnlyValue(value: string): boolean
type EventBulkPayload =
  | { action: "delete"; ids: string[] }
  | { action: "merge"; ids: string[]; targetId: string }
~~~

### 3. Contracts

- A blank optional date may be null, undefined, or an empty string.
- A nonblank date must be an exact, real yyyy-MM-dd calendar day; accepted values persist at 12:00 UTC.
- saveEvent() rejects endsAt earlier than startsAt and derives stored status from valid dates.
- Event bulk writes accept delete or merge with at least one ID. Merge additionally requires at least two future IDs and a selected `targetId`.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Impossible or malformed nonblank date | `请输入有效的日期。` |
| endsAt earlier than startsAt | `活动结束日期不能早于开始日期。` |
| Whitespace-only required talent/event/ladder/asset text | Field-specific Chinese required error |
| Event bulk action other than delete/merge, or empty IDs | Zod validation failure before repository access |

### 5. Good / Base / Bad Cases

- Good: `2028-02-29` becomes `2028-02-29T12:00:00.000Z`.
- Base: null or blank optional dates remain null and an undated event remains supported.
- Bad: `2026-02-31`, `2026-2-01`, and a start/end pair of `2026-06-02` / `2026-06-01` are rejected.

### 6. Tests Required

- `tests/unit/lib/date.test.ts`: leap day, malformed/impossible dates, noon-UTC output, and invalid ranges.
- `tests/unit/admin/mutations.test.ts`: blank required fields, impossible/reversed event dates, valid undated writes, and date-range invariants.
- `tests/unit/domain/queries.test.ts` and `tests/unit/app/sitemap.test.ts`: deliberately stale stored status still yields date-derived public behavior.
- Explicit TypeScript check: unsupported `set_status` payloads must not remain in the shared type.

### 7. Wrong vs Correct

~~~ts
// Wrong: compatibility state can be stale.
const isFuture = event.status === "future";

// Correct: public temporal behavior derives from dates.
const isFuture = deriveEventTemporalStatus(event.startsAt, event.endsAt) === "future";
~~~

## Current Lineup Contract

All lineups saved through the current admin flow are normalized to status confirmed. New manual lineups and arbitrary client-provided sources are stored with source blank.

An existing `douyin:<scheduleEntryId>` source is preserved only when the saved lineup keeps the same persisted lineup ID, talent ID, and date identity. Removing it or changing that identity clears the source and suppresses the schedule entry so a later sync cannot silently recreate the administrator's edit. ParticipationStatus and old rows may still contain pending, but the current UI/write flow does not preserve pending or accept a new client-provided source.

Do not revive other pending/source behavior merely because old reports or broad types mention it. A task that adds another source must deliberately update the UI, mutation schema/normalization, public rendering, reconciliation ownership, and tests.

## Talent and Public Identity

- Nickname is required and case-insensitively unique after trim/lowercase normalization.
- Slugs are optional. getPublicIdentifier() chooses nonblank slug, then ID.
- Detail queries accept either decoded slug or ID through matchesPublicIdentifier().
- Search keywords for talents include the nickname and aliases when saved.
- Blank link rows and representation rows without an asset are discarded.
- Representation order is the array order and is persisted as sortOrder.

Always build links with getTalentPath() / getEventPath(); do not concatenate a possibly-null slug.

## Archives and Media

- Archives are owned and scoped by editorId, then grouped by editor on public event pages.
- An archive entry may omit sceneAssetId, sharedPhotoAssetId, and cosplayTitle.
- An entry must reference a talent in the saved event lineup.
- hasSharedPhoto is counted by editor summaries; UI display additionally requires an actual shared-photo asset.
- Legacy missing entry dates are resolved from a unique matching lineup date, then event start/end.

Two blank-role behaviors are intentionally different today:

- talent history pastEvents omits its detail line when no archive role text exists;
- talent field-record cards use “未记录角色 / 作品 / 游戏” as roleSummary.

Do not claim the blank-role fallback is globally removed unless buildTalentFieldRecords() and its tests are changed.

## Read Models

Keep pages thin by extending the existing projections:

- TalentSummary / EventSummary for lists and cards;
- TalentDetail / EventDetail for detail routes;
- HomepageDiscovery for the homepage;
- SiteSearchResult for scoped search;
- DashboardSummary for the admin overview.

src/modules/domain/queries.ts owns search weighting, pinyin sorting, timeline inclusion, related-content calculation, grouping, fallbacks, and counts. JSX may format a prepared field but should not reimplement these joins.

Current notable rules:

- talents default to pinyin order;
- homepage shows four recently updated featured talents and two future events prioritized by lineup size;
- past talent history includes a lineup talent once the past event has any archive entry, even if that talent has no individual entry;
- an event's editor filter requires that editor to have an archive with at least one entry;
- ladders derive editor.name + “的天梯榜”; stored legacy titles are not the public authority.

## Deletion and Bulk Actions

- Talent deletion is cascading, not blocked: references in lineups, archives, and ladders are removed.
- Event deletion is cascading, not blocked: lineups and editor archives are removed.
- Formerly referenced asset IDs are passed to reference-aware cleanup after deletion.
- Talent bulk operations accept add tags, remove tags, and delete.
- Event bulk mutation accepts delete and an atomic merge. Merge keeps the target's editor-owned fields, spans the selected dates, deduplicates lineups/archives, and persists a Douyin merge rule so source lineups continue to update.

## Anti-Patterns

- Reading stored event.status for public temporal behavior instead of deriving status from event dates.
- Comparing raw timestamps for a date-only business rule.
- Allowing an archive talent/date that the saved lineup does not support.
- Using array index as persistent ordering when IDs and explicit order already exist.
- Recomputing joins/counts in a page or component.
- Reintroducing old delete-blocking or pending-lineup behavior without a new approved requirement.
