# Cross-Layer Change Guide

Use this guide before changing a persisted field, admin workflow, public projection, auth boundary, date rule, or asset lifecycle.

## Trace the Actual Flow

~~~text
public read
URL params
  -> Server Component
  -> content/service.ts
     -> ContentRepository -> mock state or Postgres mapping -> ContentState
     -> domain/queries.ts(ContentState) -> read model
  -> public component

admin write
client manager draft
  -> authenticated Route Handler
  -> Zod + domain mutation
  -> ContentRepository
  -> optional reference-aware asset cleanup
  -> named response envelope
  -> manager live state
  -> public query/read model
~~~

Start at both ends. A UI field is incomplete if the repository drops it; a database column is incomplete if no query or workflow can use it.

## Ownership Questions

| Question | Owning layer |
| --- | --- |
| What shape is persisted/public? | src/modules/domain/types.ts |
| What input is allowed and which invariant must hold? | src/modules/admin/mutations.ts |
| How is it stored in both modes? | repository contract + mock/Postgres implementations |
| How is it projected for browsing? | src/modules/domain/queries.ts |
| How does HTTP authenticate/encode it? | src/app/api/** |
| How is it edited without losing work? | src/components/admin/** |
| How is it linked/rendered publicly? | public pages + site/UI components |
| How is media sized/deleted? | src/lib/asset-display.ts + src/modules/assets/cleanup.ts + storage |

Do not move a domain invariant into a React component because the component noticed it first.

## Persisted-Field Checklist

For a new or changed field, inspect every applicable item:

- domain entity/read-model types;
- Drizzle schema;
- new migration and metadata journal;
- ContentRepository contract;
- Postgres load and write mapping;
- mock repository and demoSeedState fixture;
- scripts/seed.ts mapping, with awareness that it is currently incomplete;
- Zod mutation schema and domain invariant;
- admin payload/response type;
- manager draft initialization, normalization, dirty comparison, save, and reset;
- domain query/search/sort projection;
- public rendering, metadata, sitemap/path behavior;
- unit and E2E regression coverage.

Missing one mapping often produces a successful save followed by data disappearing on reload.

## Domain Invariants to Recheck

### Dates and event state

- Treat date-only UI values through src/lib/date.ts; they are stored at noon UTC.
- Derive future/past/undated using Asia/Shanghai date semantics.
- The stored Event.status is compatibility data, not the public temporal-state rule. getTalentDetail() has one known related-reason leftover that still reads it; do not extend that behavior.
- For multi-day events, lineup and archive entry dates must remain within the event range and archive entry date must match that talent's lineup date.

### Identity and access

- Protected pages redirect through requireAuthenticatedEditor.
- Admin/API writes authenticate through getAuthenticatedEditor.
- Editor-owned ladders/archives remain scoped to the authenticated editor.
- EditorProfile may cross the public boundary; EditorAccount/password/session data may not.

### Slugs and optional content

- Slugs are nullable and links fall back to IDs.
- Event dates and several asset relationships are nullable.
- Blank archive role text and scene assets are valid.
- Current talent field-record projection still supplies 未记录角色 / 作品 / 游戏 when role text is blank; change that only as an explicit product change with tests.

### Lineups and deletion

- Current event/archive save paths normalize lineup status to confirmed and source to blank.
- Archive talent must belong to the saved event lineup.
- Talent/event deletion cascades related records and invokes reference-aware asset cleanup; do not reintroduce old deletion blocking based on removed reports.

## Asset Change Checklist

For upload, replacement, clear, or deletion:

1. Select the AssetKind and display preset from src/lib/asset-display.ts.
2. Keep the current browser crop -> multipart /api/admin/assets -> R2/mock flow unless intentionally redesigning it.
3. Track replaced/removed object IDs as cleanup candidates.
4. Save the new entity relationship before cleanup.
5. Call reference-aware cleanup; never delete an object merely because one draft stopped using it.
6. Test null assets, shared references, failed upload/save, and both mock/R2 configuration boundaries.

The presign route exists but is not the canonical InlineAssetUpload path.

## Test the Contract, Not Only the Layer

| Change | Focused proof |
| --- | --- |
| Mutation rule | mutations unit test for accept/reject behavior |
| Public filtering/projection | domain query unit test |
| Repository/account boundary | content service unit test |
| Asset replacement/deletion | cleanup and image/upload tests |
| Draft/date normalization | archive manager utils unit test |
| Admin-visible write | Playwright from admin action to public result |

When possible, assert the public consequence of an admin save. A success toast alone does not prove persistence or projection.

## Release Impact

Before merging, identify:

- whether a migration must be applied before code deploy;
- whether Vercel environment variables differ between preview and production;
- whether the change needs R2/database rather than mock verification;
- whether the cron cleanup contract is affected;
- which GitHub SHA and Vercel deployment demonstrate the result.

Record durable implementation decisions in the relevant Trellis spec/task and release evidence in the PR/deployment record, not in a new version completion-report file.
