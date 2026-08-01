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
- toDateOnlyIso() stores date-only values at 12:00 UTC to avoid boundary drift.
- Day comparisons use date keys, not arbitrary timestamp equality.
- Public filters, summary status, timelines, and detail badges derive future/past from the end date, falling back to the start date, relative to the Asia/Shanghai day.
- Missing both dates yields undated in read models.
- saveEvent() writes a compatible stored status from dates; callers must not treat payload status as authoritative when dates exist.

Known exception: the related-event reason built inside getTalentDetail() still branches on event.status. Do not copy that leftover. If the related reason is touched, switch it to the shared derived status and add a regression test with deliberately stale stored status.

For multi-day events:

- each lineup requires a date inside the event range;
- each archive entry requires a date inside the range;
- an archive entry's date must match one of that talent's saved lineup dates.

Reference implementations: getDateRangeDays(), saveEvent(), saveArchive(), buildLineupGroups(), and buildArchiveEntryGroups().

## Current Lineup Contract

All lineups saved through the current admin flow are normalized to status confirmed and source blank.

This happens in both src/components/admin/archive-manager-utils.ts and src/modules/admin/mutations.ts. ParticipationStatus and old rows may still contain pending, but current UI/write behavior does not preserve pending/source input.

Do not revive pending/source behavior merely because old reports or broad types mention it. A task that restores it must deliberately update the UI, mutation schema/normalization, public rendering, and tests.

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
- Event bulk mutation currently accepts delete only.

EventBulkPayload in src/modules/admin/types.ts still mentions set_status, but the Zod schema and handler do not accept it. Treat the executable mutation schema/tests as authoritative and do not call the unsupported action.

## Anti-Patterns

- Extending the known getTalentDetail() related-reason use of stored event.status instead of deriving temporal status.
- Comparing raw timestamps for a date-only business rule.
- Allowing an archive talent/date that the saved lineup does not support.
- Using array index as persistent ordering when IDs and explicit order already exist.
- Recomputing joins/counts in a page or component.
- Reintroducing old delete-blocking or pending-lineup behavior without a new approved requirement.
