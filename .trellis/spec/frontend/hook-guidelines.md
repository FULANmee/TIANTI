# Hook Guidelines

## Current Pattern

There is no general src/hooks directory. Most hooks remain inside the client component that owns their state because the behavior is not shared:

- AutoFilterForm keeps router/path/transition hooks beside its URL form contract.
- TalentManager keeps deferred search, live collections, draft state, and derived memo values together.
- InlineAssetUpload keeps canvas, object URL, pointer, and crop lifecycle effects inside the upload workflow.

Do not extract a one-use wrapper merely to shorten a component or satisfy a use* naming pattern.

## When to Create a Hook

Create a custom hook when it exposes a reusable behavioral contract, coordinates with a provider, or needs consistent setup/cleanup across multiple consumers.

The reference is useAdminUnsavedChanges in src/components/admin/admin-unsaved-changes.tsx:

- provider and hook are colocated because they own one concern;
- the context default is null;
- the hook throws a clear error outside its provider;
- context value is memoized;
- browser event setup has effect cleanup;
- consumers receive semantic operations such as confirmNavigation, not raw implementation details.

If a hook becomes broadly cross-feature, move it to the narrowest named module that describes its responsibility. Do not create a generic hook collection preemptively.

## Effects and Browser Resources

- Declare every reactive dependency; follow the configured React/Next ESLint rules.
- Clean up window listeners, timers, object URLs, subscriptions, and other browser resources.
- Keep server-only modules out of hook dependency graphs.
- Use useMemo only for actual derived work or stable context values, not as a default wrapper.
- Use functional state updates when callbacks depend on current state.

## Data Fetching

Server Components and content services own initial reads. Hooks do not introduce a second client-fetch cache for server-rendered content.

Client fetches are appropriate for mutations, auth, image upload/reopen, and explicit interactive operations. They must preserve drafts on failure and follow the response/error rules in [State Management](./state-management.md).
