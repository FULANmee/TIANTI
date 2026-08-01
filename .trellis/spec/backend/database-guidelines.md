# Database and Repository Guidelines

## Source of Truth

- Drizzle schema: src/db/schema.ts
- Generated/reviewed SQL history: drizzle/*.sql
- Migration journal/snapshots: drizzle/meta/**
- Repository contract: src/modules/repository/types.ts
- Implementations: src/modules/repository/mock-repository.ts and src/modules/repository/postgres-repository.ts

Application code consumes ContentState; it does not consume Drizzle row shapes directly. postgres-repository.ts::loadState() is the mapping boundary.

## Current Data Model

The normalized tables are:

- identity/session: editors, sessions
- media: assets
- talent: talents, talent_tags, talent_links, talent_assets
- event: events, event_lineup
- ladders: ladders, ladder_tiers, ladder_entries
- per-editor archives: editor_archives, archive_entries

Shared talent/event/lineup data is distinct from editor-owned ladders and archives. Preserve editorId scoping for the latter. Public state contains EditorProfile, never EditorAccount; tests/unit/content/service.test.ts protects this credential boundary.

## Nullability and Compatibility

Current schema and domain behavior intentionally allow:

- nullable talent/event slug; public paths fall back to id;
- nullable events.starts_at and events.ends_at;
- nullable talent cover and representation assets;
- nullable archive scene/shared-photo assets;
- nullable lineup/archive dates for undated or legacy single-day content.

Do not reintroduce old NOT NULL assumptions from drizzle/0000_low_scalphunter.sql. Later migrations 0002–0005 are part of the current contract.

The stored events.status column remains for compatibility. Public list filters, summary status, timelines, and detail badges derive temporal state from dates through src/lib/date.ts::deriveEventTemporalStatus. One related-event explanation in getTalentDetail() still reads the stored field; treat that as known debt, not the current status rule.

## Repository Parity

Every ContentRepository change must be implemented in both repositories.

- Mock writes clone and replace global state in mock-repository.ts.
- Postgres loads relational rows into one ContentState and writes through Drizzle.
- Relation order is explicit for talent links/representations and ladder tiers/entries through sortOrder.
- Postgres relation replacement currently uses delete-then-insert sequences without an explicit transaction. Do not assume atomicity; introducing transactions is a deliberate repository change that needs parity and regression coverage.

Deletion relies on database cascades and application cleanup:

- talent deletion cascades lineup/archive/ladder references and then checks former media candidates;
- event deletion cascades lineups/archives and then checks archive media;
- deleteAssetIfUnreferenced() uses a conditional Postgres delete to narrow the check/delete race.

## Migrations

When changing persistence:

1. Update src/db/schema.ts.
2. Generate a new migration with npm run db:generate.
3. Review the SQL, including nullability, foreign-key action, indexes, and data backfill.
4. Keep prior migration files immutable; add a new numbered migration.
5. Confirm drizzle/meta/_journal.json and snapshots match the generated history.
6. Update Postgres load/write mappings, mock state/repository, domain types, seed data, and tests.

Existing migrations include hand-reviewed compatibility/backfill logic:

- 0002_exotic_mentallo.sql backfills lineup dates.
- 0003_magical_ulik.sql backfills archive dates and adds R2 object keys.
- 0005_dizzy_susan_delgado.sql deliberately clears slugs and makes them nullable.
- 0006_opposite_omega_sentinel.sql removes the obsolete recognized column.

Do not edit an already-applied migration to express a new desired state.

## Seeding Is Destructive

scripts/seed.ts deletes all application tables in dependency order before inserting demo content. It also requires explicit editor credentials unless callers explicitly opt into mock defaults.

Important current limitation: the seed insert mapping is not a full fidelity serializer. It does not currently write talent/event discovery arrays or archive entryDate values from demoSeedState; database defaults/fallbacks take over. Do not use it as the example for a complete entity round trip. If a task depends on those fields, fix and test the seed as part of that task.

Never run npm run db:seed against production or any database containing content to preserve.

## Verification

~~~bash
npm run db:generate
npx tsc --noEmit --types node,vitest/globals
npm test -- tests/unit/admin/mutations.test.ts tests/unit/domain/queries.test.ts
npm run build
~~~

npm run db:push mutates the configured database. Resolve the exact DATABASE_URL target before running it.
