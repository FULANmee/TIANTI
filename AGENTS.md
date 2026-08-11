<!-- TRELLIS-LITE:START -->
## Project AI rules

- Treat `docs/spec/index.md` as the map of durable project memory. Before work that can affect behavior, interfaces, architecture, or conventions, read the index and then only the relevant linked specs.
- Investigate repository-answerable facts directly. Do not ask the user to recall facts available in source, tests, configuration, or documentation.
- When product, scope, domain, architecture, compatibility, or risk decisions remain unresolved, invoke `$grill-with-docs` directly. Instruct it to write glossary updates to `docs/spec/glossary.md` and ADRs to `docs/spec/adr/`; do not create `CONTEXT.md`, `CONTEXT-MAP.md`, or `docs/adr/`.
- Treat source-backed observations as current facts and explicit user-approved decisions as target rules. Surface conflicts instead of silently choosing one or overwriting the other.
- Verify completed work with the repository's existing tests, checks, or validation commands.
- Before any deployment or release action, follow the user-approved workflow in `docs/spec/deployment.md`; never deploy directly to Production merely because the user says “部署”.
- Update `docs/spec/` only when work changes durable project knowledge. After substantive work, append a concise outcome to `journal.md`.
<!-- TRELLIS-LITE:END -->
