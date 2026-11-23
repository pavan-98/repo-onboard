<!-- repo-onboard:begin summary -->
# Copilot instructions

The shared instructions for every AI agent in this repository are in [AGENTS.md](../AGENTS.md). Read it before making changes; it has the commands, repository map, testing rules and boundaries.

## Key commands

| Task | Command |
|---|---|
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Type-check | `npm run typecheck` |

## Never

- Commit secrets, credentials, tokens or `.env` files.
- Skip, delete or weaken tests to make them pass.
- Force-push to shared branches or rewrite published history.
- Hand-edit generated, vendored or build output (lockfiles, `dist/`, sections between `repo-onboard` markers).
<!-- repo-onboard:end summary -->

<!-- Add Copilot-specific notes below this line. -->
