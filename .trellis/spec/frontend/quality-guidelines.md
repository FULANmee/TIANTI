# Frontend Quality Guidelines

## Required Checks

Use Node 24 and run checks proportional to the flow:

~~~bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
npm run test:e2e:smoke
~~~

Run npm run test:e2e before release or after changes to admin editing, uploads, drag/drop, filters, responsive rails, or public projections.

The build must not load remote fonts. Typography uses system CJK stacks or, if a future requirement justifies the payload, committed local font assets. A build-time font network request is an application regression.

## Scenario: Network-Independent Typography Builds

### 1. Scope / Trigger

Apply this contract whenever changing the root layout, global typography tokens, font utilities, or build configuration. It prevents `next build` and releases from depending on Google Fonts reachability.

### 2. Signatures

~~~text
npm run build
--font-sans-stack
--font-display-stack
~~~

`src/app/layout.tsx` imports `globals.css` but no remote font module. `font-sans` and `font-display` map to the two CSS stack variables.

### 3. Contracts

- Production builds perform zero font downloads.
- Body copy uses `--font-sans-stack`; display headings use `--font-display-stack`.
- Each stack prefers installed Noto CJK/SC faces, then platform Chinese faces, then a generic family.
- Adding committed local fonts requires an explicit size/performance decision; remote build-time fonts remain disallowed.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Google Fonts is unavailable | `npm run build` still succeeds |
| No preferred Noto face is installed | Browser selects a platform/generic fallback without a request or blank text |
| A `fonts.google*` resource appears | Quality check fails; remove the remote dependency |
| Body/display computed styles collapse to one token | Restore the separate sans/display stacks |

### 5. Good / Base / Bad Cases

- Good: a machine with Noto CJK installed uses it locally and the build stays offline-safe.
- Base: macOS/Windows/Linux uses an available Chinese or generic system fallback with the same sans/display roles.
- Bad: importing `Noto_Sans_SC` or `Noto_Serif_SC` from `next/font/google` makes the build download CJK shards.

### 6. Tests Required

- Node 24 `npm run build`: assert compilation, TypeScript, page generation, and route collection complete without font-fetch output.
- Rendered desktop and 390 px checks: assert meaningful content, no framework overlay, no horizontal overflow, and no relevant console warnings/errors.
- Browser computed-style/resource check: assert body/display stacks differ and no link resource targets `fonts.googleapis.com` or `fonts.gstatic.com`.

### 7. Wrong vs Correct

~~~tsx
// Wrong: build output depends on a remote service.
import { Noto_Sans_SC } from "next/font/google";

// Correct: the layout imports global CSS; CSS tokens own a zero-request system stack.
import "@/app/globals.css";
~~~

## Test Placement

- Put pure draft/normalization regression tests in tests/unit/admin, following archive-manager-utils.test.ts.
- Put browser user journeys in tests/e2e/smoke.spec.ts.
- Keep tests/e2e/ci-smoke.spec.ts short and release-critical.
- Test server query/mutation behavior at its domain owner instead of mounting a component to retest it.

Playwright runs serially with mock content/storage and TIANTI_E2E=1. Each test resets state through /api/test/reset.

## Selector Conventions

Prefer:

1. role and accessible name;
2. associated label or visible text;
3. data-testid for stable complex mechanics or layout anchors.

Do not couple tests to long Tailwind class strings or generated DOM depth. Reuse existing E2E helper flows for login, opening dialogs, crop confirmation, and upload.

## Accessibility Review

- Keyboard-reachable native controls and links.
- Labels/accessibility names for every action and input.
- Dialog title/role/modal semantics and a clear close path.
- Visible pending, success, warning, and error feedback.
- Focus behavior remains usable after dialog/navigation state changes.
- Reduced-motion behavior remains intact.
- Color is not the sole carrier of status.

## Responsive and Visual Review

Check at minimum narrow mobile and desktop widths:

- no clipped actions, filters, dialogs, or long Chinese labels;
- grid/rail item widths remain usable;
- optional/missing images do not collapse cards;
- touch targets and horizontal rails remain operable;
- public/admin variants retain shared spacing and surface language.

Reuse globals.css tokens/primitives rather than comparing new components only in isolation.

## Workflow Review Checklist

- [ ] Server/client boundary is as small as practical.
- [ ] URL-owned state survives refresh/back navigation.
- [ ] Admin drafts survive a failed request and prevent duplicate submission.
- [ ] Unsaved meaningful edits are guarded where navigation can discard them.
- [ ] Empty, null, undated, and unauthenticated/authenticated states are deliberate.
- [ ] Shared domain/admin types match the actual payload.
- [ ] A write is tested through to the public read model when visibility changes.
- [ ] New interactive behavior has accessible semantics and an E2E assertion where risk warrants it.

## Known Non-Examples

Do not copy these current leftovers as conventions:

- full-page reloads in older client success flows;
- the duplicate/unused crop-session helper retained in InlineAssetUpload;
- historical report assertions that no longer match rendered filters or empty-field behavior.
