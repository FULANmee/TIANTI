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

The build loads Google-hosted fonts through Next font handling. In a network-restricted environment, a font fetch failure is an environment limitation; verify the same commit in CI/Vercel rather than classifying it as an application regression without evidence.

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
- stale EventBulkPayload set_status typing;
- historical report assertions that no longer match rendered filters or empty-field behavior.
