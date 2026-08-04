# Backend Guidelines

These rules cover the server side of the single-package TIANTI Next.js application. They are based on src/app/api/**, src/modules/**, src/db/**, src/storage/**, scripts/**, and the tests—not on the removed version reports.

## Runtime Shape

~~~text
public/admin server page
  -> src/modules/content/service.ts
     -> ContentRepository selected by src/modules/repository/index.ts
        -> mock in-memory state or Postgres/Drizzle
        -> ContentState
     -> pure projection in src/modules/domain/queries.ts
        -> public/admin read model

admin client component
  -> authenticated Route Handler in src/app/api/**
  -> Zod-backed mutation in src/modules/admin/mutations.ts
  -> repository and, when relevant, asset cleanup/R2
~~~

The production-shaped stack is Next.js 16 + React 19, Postgres through Drizzle, and Cloudflare R2 through the S3 client. Mock content and storage are first-class local/test modes.

## Guides

| Guide | Use it for |
| --- | --- |
| [Directory and Dependency Boundaries](./directory-structure.md) | Choosing the owning layer and keeping imports one-way |
| [Database and Repository](./database-guidelines.md) | Schema, migrations, repository parity, and destructive seeding |
| [Domain and Mutation Contracts](./domain-guidelines.md) | Current business invariants and public read models |
| [API, Authentication, and Errors](./error-handling.md) | Route Handler contracts, sessions, status codes, and client-safe errors |
| [Douyin Profile Sync](./douyin-sync-guidelines.md) | Scraper boundary, parsing, source ownership, reconciliation, and release gates |
| [Logging](./logging-guidelines.md) | The deliberately sparse operational logging contract |
| [Assets and Object Storage](./storage-guidelines.md) | Image upload, display ratios, R2, and orphan cleanup |
| [Backend Quality](./quality-guidelines.md) | Tests, checks, and review expectations |

## Pre-Development Checklist

- Identify whether the change owns a domain type, a read model, a mutation, persistence, or only an HTTP adapter.
- Search src/modules/domain/types.ts, src/modules/domain/queries.ts, and src/modules/admin/mutations.ts before inventing a parallel contract.
- If persisted data changes, inspect src/db/schema.ts, both repository implementations, scripts/seed.ts, src/modules/domain/seed.ts, and every migration under drizzle/.
- If the change touches dates, read the date-only and Asia/Shanghai rules in src/lib/date.ts.
- If the change touches images, read src/lib/asset-display.ts and src/modules/assets/cleanup.ts.
- If an old plan/report disagrees with current source or tests, current source and tests win.

## Quality Check

Use Node 24, as pinned by package.json, .nvmrc, environment.yml, and CI.

~~~bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
~~~

Run npm run test:e2e:smoke for routing/auth/ladder changes and npm run test:e2e for admin-to-public workflows. The repository has no dedicated typecheck script. Tests are included by tsconfig without Vitest globals, so the current reliable explicit type-only command supplies node,vitest/globals. Bare npx tsc --noEmit currently reports missing describe/it/expect/vi globals; treat that as known tsconfig debt.

When database or R2 behavior changes, also verify both modes:

- mock: TIANTI_CONTENT_MODE=mock, TIANTI_STORAGE_MODE=mock
- deployed shape: TIANTI_CONTENT_MODE=database, TIANTI_STORAGE_MODE=r2 with valid environment variables

Never run npm run db:seed against a database that contains content to preserve.
