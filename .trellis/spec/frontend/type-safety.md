# Frontend Type Safety

## Compiler Baseline

TypeScript is strict, noEmit, ES2022, isolatedModules, and uses the @/* alias. Keep new code compatible with Server/Client Component boundaries and avoid any, unchecked casts, and non-null assertions around intentionally nullable content.

The current reliable explicit check is:

~~~bash
npx tsc --noEmit --types node,vitest/globals
~~~

Bare npx tsc --noEmit currently reports missing describe, it, expect, and vi globals because tsconfig includes tests without declaring Vitest globals. This is known configuration debt, not evidence that production modules are untyped.

## Canonical Type Ownership

- Persisted domain entities and public read models: src/modules/domain/types.ts
- Admin payload and response contracts: src/modules/admin/types.ts
- Component-only props/drafts: beside the component
- Validated mutation input: Zod schemas in src/modules/admin/mutations.ts

Import shared types with import type. Do not recreate Talent, Event, Asset, EditorArchive, or HTTP response shapes in a page just to select fewer fields; use Pick/Omit or add an intentional read-model type at the domain boundary.

Keep EditorProfile and EditorAccount distinct. Frontend/public components must never gain account credentials merely for typing convenience.

## Boundary Narrowing

Values from these sources are untrusted or wider than the desired type:

- searchParams and dynamic route params;
- response.json();
- FormData and input values;
- drag/drop/clipboard DataTransfer;
- environment-dependent URLs and nullable assets/dates.

Narrow with typeof, Array.isArray, instanceof, enum membership, or validated Zod output before use. Do not cast a raw search param directly to a union without checking membership.

Client validation improves feedback, but only server Zod/domain validation establishes a write contract.

## Nullability

Current types deliberately allow nullable:

- talent/event slug;
- event start/end;
- talent cover and representation asset;
- archive scene/shared-photo asset;
- lineup and archive entry dates.

Use optional chaining, null coalescing, conditional JSX, public-path fallbacks, and shared date formatters. Do not silence nullability with exclamation marks based on old schema/report assumptions.

## Literal Unions and Exhaustiveness

- Preserve literal unions with as const for fixed maps/options, as StatusNotice and event sort labels do.
- Prefer discriminated/explicit unions over arbitrary strings for variants, asset kinds, statuses, and sort modes.
- When adding a union member, search switch/maps/options/tests so rendering and validation remain aligned.
- Use satisfies when checking a constructed object without widening it, as the crop session builder does.

## Props and React Types

- Use ReactNode for compositional children/footer/heading props.
- Type browser events explicitly when handlers inspect target/currentTarget.
- Keep callback contracts specific, for example onUploaded receives Asset rather than unknown.
- Pass serializable data across a Server-to-Client boundary; do not pass server functions, database rows, or class instances.

## HTTP Payloads

Give reusable admin responses a named type in src/modules/admin/types.ts and keep it aligned with the actual route envelope. Still guard failed/non-JSON responses at runtime.

The existing EventBulkPayload includes a stale set_status branch while the executable server schema accepts only delete. Do not copy or extend the stale branch; reconcile the contract if that area is changed.
