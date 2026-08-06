# Backend Quality Guidelines

## Required Checks

The canonical project checks are:

~~~bash
npm run lint
npx tsc --noEmit --types node,vitest/globals
npm test
npm run build
npm run test:e2e:smoke
~~~

Run npm run test:e2e before release or after admin-to-public workflow changes. CI runs lint, unit tests, build, and the small Playwright smoke suite on main, 5.0, and codex/**.

Use Node 24. A green run under another Node version does not prove parity with CI/Vercel.

Bare npx tsc --noEmit currently reports missing Vitest globals because tsconfig includes tests without declaring their types. Until that configuration is fixed, use the command above for a clean explicit type-only check.

## Unit-Test Conventions

- Tests live under tests/unit/** and run in jsdom via Vitest.
- Reset mutable mock content with setMockState(structuredClone(demoSeedState)) in beforeEach.
- Use fake time for date/status/cleanup behavior and restore real timers in afterEach.
- Exercise mutations through their public functions instead of editing mock state for write-contract tests.
- For pure projections, clone demoSeedState, add the smallest fixture delta, and call the exported query.
- Environment tests must reset modules and restore process.env, as in tests/unit/lib/env.test.ts.

Add regression tests at the contract owner:

| Change | Minimum focused tests |
| --- | --- |
| Mutation/invariant | tests/unit/admin/mutations.test.ts |
| Query/read model | tests/unit/domain/queries.test.ts |
| Credential boundary | tests/unit/content/service.test.ts |
| Asset lifecycle | cleanup + asset display/image transfer tests |
| Draft normalization | tests/unit/admin/archive-manager-utils.test.ts |

## E2E Conventions

Playwright is serial with one worker and launches the app with mock content/storage plus TIANTI_E2E=1.

- Every test resets state through /api/test/reset.
- Prefer roles/labels for user-facing semantics and data-testid for stable complex interactions, drag/drop, uploads, and responsive structure.
- Reuse helper flows such as login, crop confirmation, and dialog entry.
- Assert the public result of an admin write, not only the admin success message.
- Keep tests/e2e/ci-smoke.spec.ts fast and release-critical; put broader workflows in tests/e2e/smoke.spec.ts.

## Review Checklist

- [ ] The Route Handler is thin and authenticated when it mutates or exposes admin assets.
- [ ] Unknown input is validated before persistence.
- [ ] Mock and Postgres repositories still satisfy the same contract.
- [ ] Public state cannot expose editor email/password/session material.
- [ ] Date-only values and Shanghai-derived status use shared helpers.
- [ ] Nullable slug/date/asset cases are covered.
- [ ] Multi-day lineup/archive invariants remain aligned.
- [ ] Cascading deletes collect media candidates and use reference-aware cleanup.
- [ ] A new persisted field is mapped through schema, migration, repositories, seed/fixtures, mutations, reads, and tests.
- [ ] No old report has been treated as executable authority.

## Known Non-Examples

Do not copy these current leftovers as conventions:

- the mojibake auth string in the admin asset GET route;
- stale set_status in EventBulkPayload when the executable schema accepts only delete/merge;
- incomplete discovery/date serialization in scripts/seed.ts;
- the getTalentDetail() related-event reason reading stored event.status instead of the shared derived status;
- full-page reload in older client flows when local-state update or router.refresh() can preserve work.

They are review targets if touched, not templates for new code.
