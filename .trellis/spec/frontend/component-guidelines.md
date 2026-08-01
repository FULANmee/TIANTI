# Component and Styling Guidelines

## Component Shape

Prefer small compositional components with explicit props. Shared primitives accept children, className, and a small semantic variant set only when real callers need it.

Examples:

- PageShell varies public/admin spacing and full-bleed width.
- StatusNotice restricts variant to info, success, warning, or error.
- FilterBar owns filter-surface framing, not filter values.
- AdminDialog owns modal framing while callers supply body and footer actions.

Avoid large configuration objects that hide JSX or a universal component with domain-specific conditionals. It is acceptable for admin managers to be large workflow owners; extract stable visual pieces or pure normalization logic, not arbitrary fragments.

## Server and Client Boundaries

- Keep display-only cards and layouts as Server Component-compatible modules.
- Add use client only at the smallest boundary that needs handlers, hooks, browser APIs, canvas, drag/drop, or fetch.
- Pass serializable domain data from server pages into client managers.
- Never import server-only session, repository, database, or storage modules into a client component.

## Styling System

The project uses Tailwind CSS 4 plus global CSS custom properties and shared ui-* classes in src/app/globals.css.

- Use variables such as --foreground, --line-soft, --color-accent, --shadow-soft, and motion/radius tokens.
- Reuse surface, surface-strong, ui-kicker, ui-subtle, ui-muted, ui-input, ui-select, ui-textarea, and ui-button-* before writing a parallel look.
- Merge conditional class names with src/lib/cn.ts.
- Preserve the light, airy editorial surface language and current responsive max widths.
- Use arbitrary Tailwind values when the design needs a specific radius/grid, but prefer an existing token for recurring decisions.

Do not hardcode a new color family for a reusable component when an existing semantic token/variant covers it.

## Responsive Composition

Build mobile-first, then add md/xl layout changes. Existing patterns include:

- stacked content becoming explicit grid columns;
- compact two-column cards expanding to three or six columns;
- horizontal card rails for narrow viewports;
- flex-wrap for action groups and metadata;
- svh-aware page height and viewport-bounded, scrollable dialogs.

Avoid desktop-only fixed widths. Verify long Chinese names, empty labels, and narrow screens.

## Empty, Optional, and Image States

- Use EmptyState for a meaningful empty collection rather than leaving blank space.
- Render optional text/assets only when present and provide product-language fallbacks such as city/date pending where the page needs context.
- Obtain image aspect/display classes through src/lib/asset-display.ts::getAssetDisplayPreset. All AssetKind values support both 3:4 and 4:3, default to 3:4 when dimensions are unavailable, and otherwise choose the preset closest to the asset's actual width/height ratio.
- Keep alt text tied to the asset/domain context.
- Do not require scene/cover assets that domain types intentionally allow to be null.

## Accessibility and Interaction

- Use native controls and semantic buttons/links.
- Connect labels to form controls; do not use input hint text as the only label for admin inputs.
- Dialogs use role=dialog, aria-modal, and an accessible title.
- Icon-only controls need an accessible name.
- Preserve visible focus behavior through the shared form/button styles.
- Respect prefers-reduced-motion; globals.css already disables long animation/scroll behavior.
- Do not make hover the only way to discover or perform an action.

Use data-testid only for stable complex flows where role/label text is insufficient, such as drag/drop, crop, responsive rails, or key E2E page anchors.

## Real Examples to Follow

- src/app/(public)/events/[slug]/page.tsx composes server data, optional fields, empty states, cards, and rails.
- src/components/site/auto-filter-form.tsx is a focused client island for URL navigation.
- src/components/admin/admin-dialog.tsx demonstrates a constrained semantic primitive.
- src/components/admin/inline-asset-upload.tsx keeps browser-specific crop work at the client boundary while using shared ratio contracts.
