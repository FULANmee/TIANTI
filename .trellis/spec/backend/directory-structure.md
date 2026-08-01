# Directory and Dependency Boundaries

## Ownership Map

| Path | Owns |
| --- | --- |
| src/app/(public)/** | Public App Router pages, metadata, query-param parsing, redirects |
| src/app/admin/** | Authenticated server layouts/pages and admin page composition |
| src/app/api/**/route.ts | HTTP/auth boundary only |
| src/modules/domain/types.ts | Persisted domain shapes and public read-model types |
| src/modules/domain/queries.ts | Pure projections, filtering, sorting, grouping, and derived status |
| src/modules/content/service.ts | Server-only facade from pages to repository-backed queries |
| src/modules/admin/mutations.ts | Runtime validation, normalization, business invariants, writes |
| src/modules/repository/types.ts | Persistence port |
| src/modules/repository/mock-*.ts | Mutable in-memory implementation and test reset support |
| src/modules/repository/postgres-repository.ts | Drizzle mapping and relational writes |
| src/db/** | Drizzle schema and connection creation |
| src/storage/** | R2/S3 operations; no business-reference decisions |
| src/modules/assets/cleanup.ts | Reference-aware asset lifecycle |
| src/lib/** | Focused cross-layer helpers such as dates, env, sessions, paths, image ratios |
| drizzle/** | Ordered SQL migrations and Drizzle metadata |
| scripts/seed.ts | Destructive database seeding |

## Dependency Direction

Follow the established direction:

~~~text
page -> content service
content service -> repository interface -> implementation -> ContentState
content service -> domain query(ContentState) -> read model
route -> admin mutation -> repository interface
admin mutation -> asset cleanup -> repository/R2
~~~

Examples:

- src/app/(public)/events/page.tsx calls getEventIndex(); the content service loads ContentState and then passes it to listEventSummaries().
- src/app/api/admin/events/[id]/route.ts authenticates, then delegates to saveEvent() or removeEvent().
- src/modules/admin/mutations.ts validates and normalizes before calling ContentRepository.

Do not:

- import Drizzle tables or getDb() from pages, components, or Route Handlers;
- put query scoring/grouping in JSX;
- put HTTP response construction in mutations;
- put business-reference scanning in src/storage/r2.ts;
- let client components import server-only modules.

The server-only package is deliberately imported by sessions, content services, repositories, mutations, queries, cleanup, and R2 code. Preserve that boundary.

## Feature Placement

For a new read feature:

1. Extend domain/read-model types when a reusable shape is needed.
2. Project it in src/modules/domain/queries.ts.
3. Expose it through src/modules/content/service.ts.
4. Render it in a server page; pass only interactive fragments to client components.

For a new write feature:

1. Add the payload schema and invariant to src/modules/admin/mutations.ts.
2. Extend ContentRepository only if persistence needs a new operation.
3. Implement mock and Postgres behavior together.
4. Keep the Route Handler a thin auth/JSON adapter.
5. Update the owning admin component's local live state after success.

## Naming and Imports

- Source files are kebab-case; React exports are PascalCase; functions and variables are camelCase.
- Use the configured @/* alias for imports under src.
- Route files follow App Router names: page.tsx, layout.tsx, route.ts.
- Domain IDs are strings. Postgres rows use UUIDs, while mock fixtures use readable IDs; never make UI/query logic depend on UUID syntax.

## Compatibility Paths

Two redirect routes are intentional and tested:

- src/app/(public)/schedule/page.tsx maps legacy schedule traffic to /events.
- src/app/admin/(protected)/events/page.tsx maps the retired event editor to /admin/archives.

Do not create a second event-management flow under /admin/events; the activity/archive workspace is canonical.
