# Frontend Guidelines

These rules cover App Router pages, React components, browser state, styling, and public/admin user flows in the single-package TIANTI application. They describe the current Next.js 16 and React 19 code, not claims from removed version reports.

## Rendering Shape

~~~text
public route
  -> async Server Component parses params
  -> content service/read model
  -> small client island only for browser interaction

protected admin route
  -> server layout authenticates editor
  -> server page loads ContentState
  -> client manager owns live view + editable draft
  -> authenticated JSON or multipart Route Handler
~~~

Prefer Server Components by default. Add use client only when a component needs browser APIs, event handlers, effects, local interactive state, or client navigation.

## Guides

| Guide | Use it for |
| --- | --- |
| [Directory and Ownership](./directory-structure.md) | Choosing between app, site, admin, UI, and lib |
| [Routing and Data Loading](./routing-and-data-loading.md) | Params, filters, metadata, redirects, auth, and client navigation |
| [Components and Styling](./component-guidelines.md) | Composition, props, design tokens, empty states, and accessibility |
| [Hooks](./hook-guidelines.md) | When a project hook is justified and how provider contracts are scoped |
| [State Management](./state-management.md) | URL state, manager drafts, transitions, and unsaved changes |
| [Type Safety](./type-safety.md) | Shared domain types, boundary narrowing, and nullable data |
| [Frontend Quality](./quality-guidelines.md) | Checks, responsive/accessibility review, unit tests, and Playwright |

Use [Cross-Layer Change Guide](../guides/cross-layer-thinking-guide.md) whenever a UI change also writes data, changes a public read model, or affects assets.

## Pre-Development Checklist

- Start at the route and trace the data to src/modules/content/service.ts rather than fetching an internal API from a Server Component.
- Search src/components/ui/** and src/app/globals.css before creating another surface, button, notice, filter, or page shell.
- Keep business validation in src/modules/admin/mutations.ts; client validation is only immediate user guidance.
- Identify which state is shareable URL state, persisted server state, or an unsaved local draft.
- Check mobile and desktop layouts, null/empty assets, undated events, and authenticated versus anonymous views.
- Treat source and tests as authority when an old report describes a different interface.

## Baseline Checks

Use Node 24.

~~~bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
~~~

Run npm run test:e2e:smoke for release-critical route/auth flows and npm run test:e2e after admin-to-public workflow changes. The explicit Vitest globals are currently required because tsconfig includes tests without declaring their globals.
