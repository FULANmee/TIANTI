# Frontend State Management

## Current Model

There is no global client state library. Use the smallest owner:

| State kind | Owner |
| --- | --- |
| Shareable public filters / selected archive event | URL search params |
| Fetched public read model | Server Component |
| Persisted admin collection mirrored for immediate UI | Manager live* state |
| Unsaved form edits | Manager-local draft state |
| Cross-admin navigation guard | AdminUnsavedChangesProvider context |
| Derived filters/maps/duplicate checks | useMemo / useDeferredValue |
| Request pending state | useTransition or focused boolean state |

Do not introduce a store for state already owned by the URL, server render, or one manager.

## URL-Owned State

AutoFilterForm builds URLSearchParams from nonblank form values and uses router.replace. Server pages remain the authority: the form uses defaultValue from validated params rather than duplicating the query engine in the browser.

ArchiveManager preserves the selected event with the event query param. Keep selections that users may bookmark, refresh, or navigate back to in the URL.

## Admin Live State and Drafts

Admin managers receive initial server props, then maintain:

- a live collection used for immediate post-save rendering;
- the current selected ID(s);
- an editable draft;
- message/error and pending state;
- media cleanup candidates when a draft replaces/removes assets.

Create/reset drafts through named helper functions rather than spreading persisted objects ad hoc. The manager-specific `archive-manager-utils.ts`, `talent-manager-utils.ts`, and `ladder-manager-utils.ts` modules normalize semantic values before comparison/save.

After a successful mutation:

1. read the named response payload;
2. update the matching live collection deterministically;
3. rebuild the draft from the persisted response when appropriate;
4. clear cleanup/message/transient state that no longer applies;
5. refresh or update URL state only if the server-rendered surface depends on it.

On failure, preserve the draft and show an actionable error.

## Dirty-State Protection

ArchiveManager, TalentManager, and LadderManager compare normalized persisted values and drafts, register isDirty with useAdminUnsavedChanges, and protect browser unload plus GuardedLink/sign-out navigation. Talent dialog close and native Escape cancellation use the same dirty decision before discarding.

Use normalized semantic fields for dirty comparison; do not flag whitespace-only differences or client-only row IDs. Register and clear the guard in an effect so another admin route does not inherit stale state.

After a successful save, rebuild both the visible draft and its persisted baseline from the named response payload before clearing success-state dirtiness. A cancelled discard must leave the route, dialog, and draft untouched.

Extend the shared guard if another protected workflow gains meaningful unsaved work. Do not add isolated beforeunload handlers throughout the admin UI.

## Async and Derived State

- Wrap navigation and nonblocking mutation UI updates in useTransition.
- Use pending to disable duplicate submissions and communicate progress.
- Use useDeferredValue for client search over large local lists, as TalentManager does.
- Derive maps, filtered lists, and duplicate matches with useMemo instead of storing synchronized copies.
- Use functional state setters when the next array/object depends on the current one.
- Generate client-only draft row IDs with crypto.randomUUID; do not confuse them with persisted IDs until the server responds.

## API Failure Handling

Client calls check response.ok and parse JSON defensively because proxies/runtime failures may return non-JSON bodies. Fall back to a local Chinese message and keep form state intact.

Do not assume a 2xx-shaped payload after a failed response, and do not use console output as the only user feedback.

## Known Legacy Patterns

Some existing login/ladder paths use a full-page reload after success. Treat this as compatibility debt. Prefer live state updates, router.replace, or router.refresh for new work when they preserve unsaved context and URL behavior.
