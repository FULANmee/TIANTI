# Implementation Plan

## Phase 1 — Lock Regression Contracts

- [x] Add focused date-helper tests for valid leap dates, malformed values, impossible calendar dates, blank values, and noon-UTC output.
- [x] Extend admin mutation tests to reject whitespace-only required fields, impossible event dates, and end-before-start ranges while preserving valid undated/single-day/multi-day writes.
- [x] Add or update domain-query/sitemap assertions so temporal behavior follows event dates rather than stored status.
- [x] Update E2E assertions for the shared-photo toggle to include accessible pressed/action state.

## Phase 2 — Repair Domain and Contract Defects (D3, D7, D9)

- [x] Make date-only parsing calendar-strict in `src/lib/date.ts` without changing noon-UTC storage or Shanghai status semantics.
- [x] Update `src/modules/admin/mutations.ts` so required strings trim before length validation and event payloads reject invalid/reversed dates with clear Chinese errors.
- [x] Mirror reversed-range validation in the archive/event editor for immediate feedback.
- [x] Replace the corrupted unauthenticated asset API message and remove mojibake-compatible test text.
- [x] Replace stored-status reads in talent related-event copy and sitemap cadence with `deriveEventTemporalStatus()`.
- [x] Narrow `EventBulkPayload` to the supported delete action and remove now-unused type imports.
- [x] Run focused date, mutation, domain-query, sitemap/API tests and the explicit type-check.

## Phase 3 — Repair Public Interactions (D4, D5, D6, D10)

- [x] Add stable IDs and programmatically associated labels to every talent/event filter control while preserving query and auto-submit behavior.
- [x] Change the horizontal rail next-control boundary to disable whenever forward scrolling is unavailable.
- [x] Add `aria-pressed` and state-dependent action text to the shared-photo toggle; retain the current image transition.
- [x] Add an optional eager-image prop to `TalentCard` and enable it only for the first rendered card on the talent index/homepage.
- [x] Update stable E2E assertions for accessible filter names, photo state, and dynamically dated rail IDs.

## Phase 4 — Repair Admin Interaction Safety (D1, D2)

- [x] Convert `AdminDialog` to a native modal dialog while preserving its public props and visual structure.
- [x] Implement preferred initial focus, native focus containment/background isolation, guarded Escape handling, and reliable invoker focus restoration.
- [x] Add normalized talent-draft comparison, register the active guard while dirty, and require confirmation before close/discard.
- [x] Add normalized ladder comparison and register it with the shared provider so navigation, sign-out, reload, and tab close use existing safeguards.
- [x] Ensure successful saves and confirmed discards clear the guard without leaving stale prompts.
- [x] Verify nested archive/activity dialogs still open and close correctly.

## Phase 5 — Make E2E Calendar-Independent (D8)

- [x] Add a single Shanghai-aware relative date-key helper to `tests/e2e/smoke.spec.ts`.
- [x] Replace fixed June/July 2026 future fixtures, expected date labels, and date-bearing test IDs with values derived once per scenario.
- [x] Remove future-only assertions from seed-based homepage smoke coverage while retaining stable content and navigation assertions.
- [x] Keep `resetState()` isolation and ensure each temporal scenario creates the state it asserts.

## Phase 6 — Full Verification

- [x] Run ESLint under Node 24.
- [x] Run `tsc --noEmit --types node,vitest/globals` under Node 24.
- [x] Run focused Vitest tests, then the full Vitest suite.
- [x] Run the Playwright suite with the repository web-server configuration when Chromium is available; if the binary remains unavailable, record that environment limitation and run the complete browser checklist below.
- [x] Run a production build; if Google Fonts remain network-blocked, record the exact fetch-only failure and confirm no local compile/runtime error precedes it.

### Browser checklist

- [x] Talent/event filters expose unique accessible names and still update URL/results.
- [x] A fitting rail disables both directions; an overflowing rail advances, reaches its end, and disables next.
- [x] Shared-photo toggle reports false/true pressed state and swaps both directions.
- [x] Editing a talent then pressing close or Escape prompts; cancel preserves the draft; confirm discards it.
- [x] Editing a talent or ladder then using admin navigation/sign-out prompts; cancel keeps the route and values.
- [x] Clean dialogs close without a prompt, focus starts inside, Tab/Shift+Tab stay inside, and focus returns to the opener.
- [x] Nested archive dialogs work, and the shared modal remains usable at 390 px and desktop widths without horizontal overflow.
- [x] Above-the-fold talent image no longer produces the lazy-LCP warning; below-the-fold cards remain lazy.
- [x] No new relevant browser console errors or failed application requests appear.

## Phase 7 — Remove the Google Fonts Build Dependency (D11)

- [x] Remove `next/font/google` from the root layout so production builds perform no Google font downloads.
- [x] Define shared sans-serif body and serif display system CJK stacks without adding a dependency or bundled font payload.
- [x] Run a Node 24 production build with Google Fonts unavailable and confirm compilation, type checking, page generation, and route collection complete.
- [x] Verify desktop and 390 px rendering, computed font families, zero Google font resources, navigation, overflow, framework-overlay absence, and console health.
- [x] Record the build-independent typography contract in the frontend Trellis specs.

## Phase 8 — Review and Handoff

- [x] Review the diff against D1–D11 and confirm no redesign, migration, dependency modernization, bundled font payload, or production mutation entered scope.
- [x] Record each defect's root cause, changed files, automated/manual proof, residual risk, and any environment-only limitation in the final handoff.
- [x] Run the Trellis quality-check workflow before declaring the task complete.

## Verification Evidence

- Node 24 ESLint: passed.
- Node 24 explicit TypeScript check: passed.
- Vitest: 12 files and 86 tests passed.
- Playwright: all 24 full smoke scenarios passed with the installed system Chrome; focused reruns also passed after adding the first/remaining image loading, rail-end, 390 px dialog, and sign-out guard assertions.
- Repository Playwright discovery: all 27 tests in both files parse successfully. The default bundled Chromium executable is absent locally, so the equivalent full suite used the installed Chrome channel against the same mock/E2E server environment.
- Production build: passed completely under Node 24 after removing the build-time Google Fonts dependency; compilation, TypeScript, page generation, and route collection all completed without a font request.
- In-app Browser font QA: computed sans/display stacks were present, no Google font resource links or console warnings/errors appeared, navigation worked, and the 390 px viewport had no horizontal overflow.
- In-app browser inspection covered accessible filter names and URL/result updates, modal focus/containment/restoration, dirty-confirm cancel/accept, nested dialogs, shared-photo state, fitting rail controls, eager LCP image behavior, and console/request health.

## Bug Analysis: D1–D11 Reliability Repair Set

### 1. Root Cause Category

- **Primary categories**: **B — Cross-Layer Contract**, **C — Change Propagation Failure**, **D — Test Coverage Gap**, and **E — Implicit Assumption**.
- **Specific cause**: write normalization and public date derivation were not enforced at every consumer; admin components assumed closing/navigating was harmless and a styled dialog behaved modally; UI controls lacked explicit state/boundary semantics; E2E fixtures assumed fixed dates remained future and asynchronous saves were complete without observing a success signal; the root layout also assumed Google Fonts would always be reachable during builds.
- **Confidence**: high. Mutation/query unit tests, rendered DOM state, real browser interactions, and the final full E2E run discriminate these causes from storage or repository failures.

### 2. Why Fixes Failed (if applicable)

1. **An environment limitation became a release requirement**: initial evidence correctly isolated Google Fonts reachability from application logic, but the user later required network-independent builds. Replacing build-time downloads with system font stacks removed the dependency instead of continuing to tolerate it.
2. **A save test waited on the wrong signal**: `networkidle` on an already loaded admin page could resolve before the transition's PUT completed. Waiting for the explicit success notice removed the race and proved persistence on the public page.
3. **A repeated rail-click assertion raced smooth scrolling**: the button became disabled between `isEnabled()` and the next click. One normal user click proves interaction; scrolling the viewport to its deterministic boundary then proves the disabled end state without an unstable loop.
4. **Cold development hydration can drop an immediate synthetic edit**: retrying the interaction until the manager exposes semantic dirty state makes the test observe React ownership instead of raw pre-hydration DOM mutation.

### 3. Prevention Mechanisms

| Priority | Mechanism | Specific Action | Status |
| --- | --- | --- | --- |
| P0 | Architecture/runtime | Keep date validation in shared helpers plus Zod, derive public event status from dates, and use native `showModal()` behavior | DONE |
| P0 | Test coverage | Unit-test impossible dates/stale status/draft normalization and E2E-test dirty guards, modal focus, filter labels, rail boundaries, responsive layout, and image loading | DONE |
| P0 | Build/runtime | Keep typography on system or committed local font assets; production builds must not fetch Google Fonts | DONE |
| P1 | Compile-time | Keep EventBulkPayload narrowed to the sole executable delete action | DONE |
| P1 | Documentation/review | Record strict dates, derived temporal state, semantic dirty baselines, and modal cancel delegation in Trellis specs/checklists | DONE |
| P1 | Test process | Generate Shanghai-relative future fixtures and wait on observable response/success state instead of elapsed time or `networkidle` | DONE |

### 4. Systematic Expansion

- **Similar issues**: any new date-bearing mutation, admin draft manager, public toggle, time-dependent E2E fixture, or build-time remote asset can repeat the same class of failure.
- **Design improvement**: continue using contract-owner helpers and manager-specific semantic normalizers instead of parallel validation or raw object comparison.
- **Process improvement**: exercise both cold-page interactions and public consequences of admin writes; distinguish unavailable external resources from code failures with an alternate local execution path.

### 5. Knowledge Capture

- [x] Updated backend domain contracts with strict date, derived status, validation/error matrix, cases, and required tests.
- [x] Updated frontend state, modal, type-safety, quality, and cross-layer guidance.
- [x] Added an executable frontend typography/build contract covering remote-resource failure and system-stack verification.
- [x] Added regression tests at the date, mutation, query, sitemap, draft-normalization, and browser-flow owners.
- [x] Confirmed this project has no `src/templates/markdown/spec/` mirror to synchronize.
- [x] No separate issue is required; D1–D10 are implemented and verified in the active task.
