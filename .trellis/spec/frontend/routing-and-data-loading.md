# Routing and Data Loading

## Server-First Pages

App Router pages are async Server Components by default. In Next.js 16, route params and searchParams are promises; await them before narrowing values.

Read public/admin page data by calling src/modules/content/service.ts directly. Do not make a Server Component fetch this application's own Route Handler.

The public layout exports dynamic = force-dynamic because rendered status and authenticated editor capabilities can depend on current time/session state. Do not add static caching without tracing those dependencies.

## URL State and Validation

Public filters are shareable URL search params. Each server page narrows string versus array, whitelists enum values, and validates referenced IDs/slugs against current ContentState before calling a query.

Current canonical parameters are:

| Route | Parameters |
| --- | --- |
| /talents | q, tag, mcn, editor, tier, hasSchedule |
| /events | q, eventStatus, city, editor, talent, date, sort |
| /search | q, scope |
| /ladder | editor |
| /admin/archives | event |

Omit blank params rather than serializing empty strings. AutoFilterForm uses router.replace with scroll disabled so filters remain navigable without a full document reload.

Do not revive old report claims that /search has no scope controls; the current page exposes scope pills.

## Dynamic Segments and Public Paths

Talent and event slugs are nullable. Generate links with src/lib/public-path.ts so paths fall back to stable IDs. Detail queries accept slug or ID, and notFound() handles a missing result.

Use compatibility routes only as redirects:

- /schedule redirects to /events.
- /admin/events redirects to /admin/archives.

New links should point at the canonical target, not the compatibility path.

## Metadata and Structured Data

- Static index pages export metadata from src/lib/site.ts::buildMetadata.
- Dynamic detail pages use generateMetadata and the same canonical public-path helper as visible links.
- Public detail pages may include schema.org JSON-LD derived from the same read model.
- Sitemap/robots live at src/app/sitemap.ts and src/app/robots.ts.

Keep metadata null-safe for missing/undated content. Do not create a second canonical URL rule inside a component.

getSiteUrl() resolves SITE_URL, then NEXT_PUBLIC_SITE_URL, then VERCEL_PROJECT_PRODUCTION_URL. Its final hard-coded URL fallback predates the repository/Vercel migration and is compatibility debt, not deployment truth. For a deployment change, verify canonical metadata and sitemap URLs against the current production domain; prefer an explicit environment value when the platform value is not the intended canonical origin.

## Protected Routes

src/app/admin/(protected)/layout.tsx calls requireAuthenticatedEditor() before rendering admin navigation or children. Protected pages may call it again when editor scoping is part of their data selection, as archives/page.tsx does.

Client mutation/auth calls use Route Handlers. A 401 response is a server boundary, not a substitute for the protected layout.

## Loading and Navigation

- Use Promise.all for independent server reads, as event detail does for detail and viewer.
- Use Link for normal navigation.
- Use GuardedLink within protected admin navigation when unsaved work can be lost.
- Use router.replace for URL-owned filter/selection state and router.refresh when the server render must be revalidated.
- Treat full window reloads in older ladder/login flows as legacy behavior, not the default for new work.

## Page-State Rendering

Every collection page should deliberately render:

- populated results;
- an EmptyState for no matching data;
- null/undated/missing-asset fallbacks where allowed by domain types;
- pending feedback when client navigation is in transition.

Do not let a historical database NOT NULL assumption leak into the route UI.
