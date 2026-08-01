# Frontend Directory and Ownership

## Route Layer

| Path | Responsibility | Examples |
| --- | --- | --- |
| src/app/(public)/** | Public layouts/pages, route-param parsing, metadata, JSON-LD | events/page.tsx, events/[slug]/page.tsx |
| src/app/admin/(protected)/** | Authenticated server entry points that load data and mount managers | archives/page.tsx, talents/page.tsx |
| src/app/admin/login/** | Anonymous admin sign-in page | login/page.tsx |
| src/app/api/** | HTTP adapters; frontend code calls these only for mutations/uploads/auth | admin/archives/route.ts, auth/sign-in/route.ts |
| src/app/globals.css | Tailwind import, global design tokens, shared utility classes, reduced-motion fallback | surface, ui-input, ui-button-primary |

Keep page files focused on route concerns. Public pages may compose read-model results directly; protected admin pages authenticate and pass plain serializable domain data to a client manager.

## Component Layer

- src/components/site/** contains reusable public-site components with TIANTI meaning, such as EventCard, TalentCard, SiteHeader, and AutoFilterForm.
- src/components/admin/** contains authenticated workflows, manager-local draft helpers, upload UI, dialogs, guarded navigation, and admin navigation.
- src/components/ui/** contains low-domain layout and feedback primitives such as PageShell, SectionFrame, FilterBar, EmptyState, StatusNotice, and HorizontalCardRail.

Promote a component to ui only when it is reusable without knowing about talents, events, archives, editors, or API payloads. Keep domain-specific rendering in site or admin.

## Shared Helpers and Types

- src/lib/** owns small cross-feature utilities. Examples include cn.ts, date.ts, public-path.ts, asset-display.ts, image-transfer.ts, and pinyin.ts.
- src/modules/domain/types.ts is the canonical frontend-visible domain model and read-model type source.
- src/modules/admin/types.ts owns admin HTTP payload/response contracts.
- Pure helper logic tightly coupled to one manager may stay beside that manager, as archive-manager-utils.ts does.

Do not create a generic utils.ts dumping ground. Name helpers by responsibility and move them to src/lib only when more than one feature owns the concept.

## Naming and Exports

- React component files use kebab-case and named PascalCase exports.
- App Router page/layout files use the required default export.
- Props use a nearby NameProps interface or type.
- Draft types local to one manager stay private to that module; cross-layer persisted models do not.
- Client modules place use client at the first line.
- Import project modules through the @/ alias rather than long relative paths.

There is no general src/hooks directory or hook abstraction requirement. See [Hook Guidelines](./hook-guidelines.md) before extracting one.

## Boundary Examples

- EventsPage parses URL filters and renders EventCard; it does not own event filtering rules.
- ArchiveManager owns editor interaction and drafts; archive-manager-utils.ts owns pure draft normalization.
- InlineAssetUpload owns browser crop/transfer behavior; src/lib/asset-display.ts owns canonical display ratios; the upload Route Handler owns persistence.
- PageShell owns page width/spacing; it does not load data or know the current route.
