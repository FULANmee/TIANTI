# Technical Design

## 1. Scope and Design Constraints

This repair set covers PRD defects D1–D11. It deliberately preserves the current information architecture, visual language, persistence model, API response envelopes, and mock/PostgreSQL repository split.

The implementation will follow four rules:

1. Put invariants at their owning boundary. React may provide immediate feedback, but server-side Zod/domain code remains authoritative for persisted values.
2. Reuse the existing `AdminUnsavedChangesProvider`, date helpers, and event-status derivation rather than creating parallel contracts.
3. Prefer native platform behavior for modal focus and isolation instead of adding a new dialog dependency.
4. Add the narrowest stable regression proof for each defect, with browser verification where the DOM/layout behavior is not practical to cover in Vitest.

No database migration, external service change, dependency upgrade, or production-data operation is required.

## 2. Change Map

| Defect | Owning area | Planned correction | Primary proof |
| --- | --- | --- | --- |
| D1 | Admin client state | Register semantically normalized talent/ladder drafts with the shared dirty guard; guard dialog close and route/sign-out/browser exits | Browser close/navigation flows plus focused normalization tests where extracted |
| D2 | Shared admin dialog | Back `AdminDialog` with native modal dialog behavior; handle initial focus, Escape, focus restoration, and background isolation | Desktop/mobile keyboard browser checks |
| D3 | Date helpers and admin mutations | Trim before required-length validation; reject impossible dates and reversed event ranges; mirror range feedback in the event editor | Date and mutation unit tests plus admin save checks |
| D4 | Public talent/event filter forms | Add explicit, programmatically associated labels to every filter control without changing layout | Browser accessibility snapshot and filter behavior |
| D5 | Horizontal rail | Disable next whenever no forward scroll is available | Browser checks for fitting and overflowing rails |
| D6 | Archive card | Expose toggle state with `aria-pressed` and an action-oriented label | E2E/browser state and image-toggle assertions |
| D7 | Asset API and E2E helper | Replace corrupted Chinese text and remove mojibake-compatible assertions | API/unit or E2E assertion plus repository text scan |
| D8 | Playwright fixtures | Generate future date keys relative to Shanghai time and stop treating mutable seed dates as permanently future | Playwright suite independent of calendar date |
| D9 | Domain query, sitemap, admin types | Use `deriveEventTemporalStatus()` for temporal copy/frequency and narrow bulk type to the executable action | Domain/sitemap unit coverage and type-check |
| D10 | Talent card/list | Mark only the first above-the-fold talent image as eager through an explicit card prop | Browser console/network inspection; no blanket eager loading |
| D11 | Root layout and typography tokens | Remove build-time Google Fonts imports and map body/display typography to zero-request system CJK stacks | Network-independent production build plus desktop/mobile computed-style and console checks |

## 3. Admin Draft Protection and Dialog Behavior

### 3.1 Semantic dirty state

`TalentManager` will keep a persisted draft baseline derived from the selected live talent. Its dirty comparison will normalize values that the save path normalizes (trimmed scalar text, comma-separated values, link/representation fields, and stable array order). New-row client IDs remain significant only where order/identity affects the submitted payload. When the editor is open and the normalized draft differs from the baseline, the manager will call `setGuard({ isDirty: true, message })`; it will clear the guard after a successful save, confirmed discard, or unmount.

Closing the talent dialog will use the same dirty decision as guarded navigation. A cancelled confirmation leaves both dialog and draft untouched. A confirmed discard resets the draft and upload cleanup candidates before closing. This makes close button and Escape behavior consistent.

`LadderManager` will compare a normalized editable ladder against the incoming persisted ladder. The derived title is excluded because it is not user-editable; subtitle, tier identities/order/names, and talent ordering remain significant. It will register that result with the same provider so sidebar links, sign-out, refresh/tab close, and other existing guarded navigation paths all behave consistently.

Only one manager is mounted per protected admin route, matching the provider's single active-guard contract.

### 3.2 Native modal primitive

`AdminDialog` will retain its component API but render a native `<dialog>` and call `showModal()` after mount. The native modal top layer supplies background inertness and focus containment, including nested admin dialogs.

- Store the invoking element on mount and restore focus to it after close/unmount when it is still connected.
- Focus an explicitly marked preferred control when present, otherwise the close button/first focusable control.
- Intercept the native `cancel` event, prevent implicit teardown, and call the existing `onClose`; this allows a dirty-state caller to reject Escape without losing the dialog.
- Preserve the existing header/body/footer layout, responsive max-height, and backdrop treatment using dialog/backdrop styles.
- Do not add backdrop-click dismissal, avoiding a new accidental-discard path.

Browser verification will cover Tab/Shift+Tab containment, Escape, return focus, nested activity dialogs, and a 390 px mobile viewport.

## 4. Domain Validation

### 4.1 Strict date-only conversion

`toDateOnlyIso()` will continue accepting only `YYYY-MM-DD` and storing noon UTC, but it will round-trip the parsed UTC year/month/day before returning. Values such as `2026-02-31`, month 00/13, or day 00 will return `null` instead of being normalized into another date.

A small exported predicate/helper may be added beside the existing date functions so mutation schemas can distinguish a blank optional date from a non-empty invalid date without duplicating parsing logic.

### 4.2 Authoritative mutation checks

Required talent nickname, event name, ladder subtitle/tier name, and asset title/alt fields touched by this repair will use `trim()` before `min(1)`, with existing maximum/URL/enum behavior preserved.

The event input contract will:

- accept blank/null optional start and end dates;
- reject any non-empty date that strict date-only conversion cannot parse;
- reject `endsAt < startsAt` when both are present;
- keep the existing noon-UTC storage, Shanghai temporal-status derivation, lineup-range rules, and optional/undated behavior.

The event editor's existing client validation will mirror the reversed-range rule for immediate Chinese feedback, while the server remains the source of truth. API error-envelope shapes do not change.

## 5. Public Interaction Semantics

Talent and event filter controls will receive stable IDs and visually hidden `<label>` elements. This covers search inputs, all selects, the event date input, and the already visible schedule checkbox without changing the compact filter-bar design. Existing names, query parameters, auto-submit attributes, and filtering behavior remain unchanged.

The archive shared-photo button will expose `aria-pressed={showSharedPhoto}` and communicate the next action (for example, viewing the shared photo versus returning to the scene image). The visible text may change with state, but the existing image transition and eligibility rules remain intact.

The horizontal rail's next control will use `disabled={!canScrollNext}`. Previous-control behavior, measurement, scrolling, and overflow layout are unchanged.

## 6. Stored and Derived Contract Reconciliation

The related-event reason in `getTalentDetail()` and sitemap change frequency will call the shared `deriveEventTemporalStatus(event.startsAt, event.endsAt)`. Undated events will follow the non-future/past-copy branch and monthly sitemap frequency, matching the absence of a schedulable future boundary. No persisted `Event.status` field or repository mapping is removed.

`EventBulkPayload` will advertise only `action: "delete"`, matching `eventBulkSchema`; its unused `status` member and import will be removed. This is a compile-time contract correction with no runtime API change.

## 7. Time-Stable Regression Fixtures

The E2E suite will define one Shanghai-aware helper that creates date keys a fixed number of days from the current test run. Scenarios that require future events will derive their start/end keys and expected `MM.dd` labels from those values. Test IDs containing dates will be constructed from the same keys.

The homepage smoke test will assert stable seed content and navigation only; it will not assert that an aging seed event is still future. Future-event projection remains covered by scenarios that create their own dynamically dated event after `resetState()`.

The corrupted archive-save alternative will be removed from the success helper so a mojibake regression fails loudly.

## 8. LCP Warning

`TalentCard` will accept an optional eager/priority image flag. The public talent index and homepage will pass it only to the first rendered, above-the-fold card. The underlying Next image will opt into eager loading for that card while all remaining cards stay lazy. The card markup and visual treatment do not change.

## 9. Network-Independent Typography

The root layout will not import `next/font/google`. Global CSS will expose explicit sans-serif and serif CJK system stacks through project font tokens, preferring installed Noto CJK/SC faces and falling back through platform-native Chinese and generic families. This preserves the current body/display distinction without adding remote requests, large committed font binaries, or a new dependency.

The production build is the authoritative regression proof: it must complete with Google Fonts unavailable. Browser verification will additionally check computed body/display families, zero Google font resource links, console health, navigation, and a 390 px viewport without horizontal overflow.

## 10. Verification and Release Boundaries

Automated verification will use the project's Node 24 runtime and include ESLint, the documented explicit TypeScript command, focused Vitest tests, the full Vitest suite, Playwright with the installed system Chrome, and a production build that does not depend on Google Fonts availability.

Browser regression will cover public filters, photo toggle state, rail boundaries, talent close/navigation protection, ladder navigation protection, modal keyboard/focus behavior, responsive dialog layout, and relevant console errors/warnings.

Rollback is file-level because there are no migrations or persisted-data transformations. The repair can be reverted by workstream without coordinating external state.
