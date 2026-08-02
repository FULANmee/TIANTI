# Audit and fix website bugs

## Goal

Systematically audit the existing website and repair reproducible defects, with particular attention to interactive behavior, so that the public site and administrative workflows behave reliably without regressing established functionality.

## Background

- The repository is an existing Next.js application with public pages, protected administration pages, API routes, PostgreSQL/Drizzle persistence, R2-backed asset handling, and both Vitest and Playwright test suites.
- The user reports many known bugs, including interaction defects, but has not supplied a fixed defect list; repository inspection and rendered-flow testing therefore form part of the requested work.
- The working tree was clean before this task was created, so all subsequent product-code changes can be attributed and reviewed against this audit.

## Confirmed Defects and Evidence

- **D1 — Unsaved admin drafts are lost (high):** `TalentManager.closeTalentEditor()` resets and closes without a dirty check (`src/components/admin/talent-manager.tsx:166`), and `LadderManager` never registers its draft with the shared unsaved-changes provider (`src/components/admin/ladder-manager.tsx:26`). Browser reproduction confirmed that closing a modified talent dialog and navigating away from a modified ladder show no confirmation and restore the persisted values.
- **D2 — Admin dialogs do not manage focus or modal isolation (high):** `AdminDialog` supplies role/title semantics but no initial focus, focus containment/restoration, Escape handling, or background isolation (`src/components/admin/admin-dialog.tsx:20`). Browser inspection found focus remaining on the background `编辑达人` button or on `body` while the dialog was open, and background controls remained in the accessibility tree.
- **D3 — Required names and date ranges can bypass domain invariants (high):** several Zod schemas call `.min(1)` before trimming (`src/modules/admin/mutations.ts:26`, `:57`, `:84`, `:88`), allowing whitespace-only persisted names; `toDateOnlyIso()` normalizes impossible calendar dates instead of rejecting them (`src/lib/date.ts:57`); event writes do not reject an end date earlier than the start date (`src/modules/admin/mutations.ts:366`).
- **D4 — Public filter controls lack accessible names (medium):** the talent and event filter selects/date input have neither labels nor ARIA names (`src/app/(public)/talents/page.tsx:75`, `src/app/(public)/events/page.tsx:83`). Rendered DOM exposed several anonymous `combobox` controls, making keyboard/screen-reader operation ambiguous.
- **D5 — Horizontal rail exposes a no-op next control (medium):** the next button is enabled when multiple items fit without overflow because its disabled expression also depends on `canScrollPrev` (`src/components/ui/horizontal-card-rail.tsx:158`).
- **D6 — Shared-photo toggle has no state semantics (medium):** the `已集邮` button changes the displayed image without an `aria-pressed` state or action-oriented label (`src/components/site/event-archive-card.tsx:69`).
- **D7 — User-facing/test text contains mojibake (medium):** unauthenticated asset GET returns a corrupted message (`src/app/api/admin/assets/route.ts:24`), and the full E2E helper still accepts a corrupted success string (`tests/e2e/smoke.spec.ts:25`).
- **D8 — Regression tests are time-fragile (high):** full E2E scenarios create fixed June/July 2026 events and assert they are future events (`tests/e2e/smoke.spec.ts:172`, `:200`, `:295`); those assertions are already invalid after July 2026. The initial seed-based homepage assertions also assume a future event whose dates have passed.
- **D9 — Stored and derived contracts disagree (medium):** related-event copy and sitemap change frequency branch on stale persisted `event.status` instead of the shared date-derived status (`src/modules/domain/queries.ts:936`, `src/app/sitemap.ts:27`), while `EventBulkPayload` advertises an unsupported `set_status` action (`src/modules/admin/types.ts:20`).
- **D10 — Rendered performance warning (low):** the talent-list above-the-fold LCP image is loaded lazily, producing a Next.js warning during browser testing (`src/components/site/talent-card.tsx`).
- **D11 — Production builds require Google Fonts network access (high release reliability):** `src/app/layout.tsx` imports Noto Sans/Serif SC through `next/font/google`, so `next build` downloads more than one hundred CJK font shards and fails when Google Fonts is unavailable. The user explicitly expanded the approved scope on 2026-08-02 to make builds network-independent.

## Baseline Results

- ESLint passed.
- The explicit TypeScript check passed.
- All 69 Vitest tests passed.
- The initial production build and Turbopack page load were blocked by Google Fonts network access. This was first recorded as an environment limitation, then promoted to D11 when the user requested a durable build-time fix.
- The repository Playwright suite could not launch because the local Playwright Chromium binary is absent. Equivalent critical flows were inspected in the application browser; installing a test browser remains a verification prerequisite rather than a product-code change.

## Requirements

- Establish a reproducible baseline using the repository's documented setup, static checks, unit tests, end-to-end tests, and direct browser inspection where the application can be run locally.
- Audit the main public journeys: navigation, filtering/search, event and talent discovery/detail views, schedule, ranking/ladder, responsive behavior, empty/error states, and link/form interactions.
- Audit the main administrative journeys that are locally testable: authentication, navigation, event/talent/archive/ladder management, dialogs, uploads, unsaved-change safeguards, and success/error feedback.
- Repair D1–D11, covering the confirmed product, interaction, accessibility, performance, test-reliability, and build-reliability defects above.
- Keep the existing sans-serif body and serif display hierarchy while removing D11's dependency on build-time font downloads.
- Trace each confirmed defect to its root cause and repair it at the narrowest appropriate layer while preserving existing data contracts and repository conventions.
- Add or update automated regression coverage for repaired behavior when a stable automated assertion is practical.
- Keep unrelated redesigns, content changes, and speculative feature work out of the repair set.

## Acceptance Criteria

- [x] The repository's applicable lint, type-check, unit-test, build, and end-to-end checks complete successfully, or any environment-only limitation is explicitly documented with independent evidence for the affected behavior.
- [x] Every defect changed in code has a recorded reproduction/evidence trail, root-cause explanation, and verification result.
- [x] Confirmed interaction defects in the audited public and administrative journeys are repaired without breaking keyboard operation, responsive layouts, or established navigation/data behavior.
- [x] Repaired defects receive regression tests where practical; where automation is impractical, the exact manual browser check and result are recorded.
- [x] No unrelated product behavior, visual redesign, schema migration, or destructive production-data operation is introduced without separate user approval.
- [x] A final summary distinguishes fixed defects, checks performed, and any residual risks or deferred issues.
- [x] `npm run build` succeeds without access to Google Fonts and rendered pages retain distinct body/display font stacks.

## Out of Scope

- New features or broad visual redesigns that are not necessary to repair a confirmed defect.
- Changes to live production data, credentials, third-party accounts, or deployment state.
- Dependency upgrades performed solely for modernization rather than to resolve a confirmed defect or unblock verification.
- Bundling large CJK font binaries or adding a font dependency when a zero-request system stack satisfies the approved D11 build-reliability requirement.
- Unbounded security hardening or low-impact cosmetic/accessibility cleanup outside the confirmed defect inventory.
