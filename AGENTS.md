# AGENTS.md

Instructions for AI coding agents (Codex, Claude Code, GitHub Copilot, Gemini CLI, Cursor and others) working in **repo-onboard**. Humans: start with [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/ONBOARDING.md](docs/ONBOARDING.md).

Sections between `repo-onboard` markers are generated from the repository by [repo-onboard](https://www.npmjs.com/package/repo-onboard) — run `npx repo-onboard sync` instead of editing them. Everything else is yours to edit.

## Project overview

One source of truth for every AI coding agent and every new teammate: generates AGENTS.md plus Claude, Codex, Copilot and Gemini adapters from your real repo, and keeps them in sync.

<!-- repo-onboard:begin stack -->
- **TypeScript on Node.js** >=22.12 (from `package.json`) · package manager: npm · tooling: Vitest, Biome
- **CI:** GitHub Actions
<!-- repo-onboard:end stack -->

## Commands

<!-- repo-onboard:begin commands -->
Run from the repository root.

| Task | Command |
|---|---|
| Install dependencies | `npm ci` |
| Run locally | `npm run dev` |
| Build | `npm run build` |
| Test | `npm test` |
| Lint | `npm run lint` |
| Format | `npm run format` |
| Type-check | `npm run typecheck` |
<!-- repo-onboard:end commands -->

## Repository map

<!-- repo-onboard:begin repo-map -->
- `.github/` — GitHub workflows, templates and Copilot config
- `bin/` — Executable entry points
- `docs/` — Documentation
- `schema/` — Schemas
- `src/` — Source code
- `test/` — Tests
<!-- repo-onboard:end repo-map -->

## Code style

- Match the conventions of the surrounding code and nearby files before introducing new patterns.
- TypeScript, strict mode, ESM only (`.js` suffix on relative imports, `import type` for types). Node ≥ 22.12, no runtime polyfills.
- Formatting and linting are Biome (`npm run format` fixes both). Single quotes, semicolons, trailing commas, 2-space indent.
- Keep dependencies minimal: prefer `node:` built-ins (`fs/promises`, `util.styleText`) over new packages. Adding one needs a reason in the PR.
- Every file operation goes through a `FileOp` (`src/core/types.ts`) and `planChanges` (`src/core/plan.ts`); never write files directly from a target or template, so `--dry-run`, `sync --check` and `check` stay accurate.
- Generated output must be deterministic: no timestamps (except the first ADR's date), stable sort orders, posix paths, LF line endings.
- New AI tool support = one `Target` in `src/targets/`, with its `docs` URL and `verified` month, plus tests in `test/commands.test.ts`.

## Testing

<!-- repo-onboard:begin testing -->
- Run the full suite: `npm test`
- Run one test: `npx vitest run <path/to/file.test.ts> -t "<test name>"`
- Test files: `**/*.{test,spec}.{ts,tsx,mts,cts}`, `**/__tests__/**`
- Add or update tests for every behaviour change; prefer running the narrowest test first.
<!-- repo-onboard:end testing -->

## Definition of done

<!-- repo-onboard:begin verify -->
Before you finish, run these in order and fix any failures:

1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
<!-- repo-onboard:end verify -->

## Boundaries

<!-- repo-onboard:begin boundaries -->
**Always**

- Run the lint, type-check and test commands above before saying a task is done.
- Keep changes small and focused; match the style of the surrounding code.
- Update docs and this file when you change commands, structure or conventions.

**Ask first**

- Adding, removing or upgrading dependencies.
- Changing CI/CD workflows, release, deployment or infrastructure config.
- Deleting files, renaming public APIs or making large cross-module refactors.
- Changing database schemas or data migrations.

**Never**

- Commit secrets, credentials, tokens or `.env` files.
- Skip, delete or weaken tests to make them pass.
- Force-push to shared branches or rewrite published history.
- Hand-edit generated, vendored or build output (lockfiles, `dist/`, sections between `repo-onboard` markers).

_Edit these in `repo-onboard.config.json` → `boundaries`, then run `npx repo-onboard sync`._
<!-- repo-onboard:end boundaries -->

## Commits and pull requests

<!-- repo-onboard:begin git -->
- Write short, imperative commit messages (e.g. "Add retry to upload client").
- Keep pull requests focused on one change and describe how it was tested.
- Record significant decisions as an ADR in `docs/adr/` (`npx repo-onboard add adr "<title>"`).
- CI runs: `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `node bin/repo-onboard.js --version`
<!-- repo-onboard:end git -->

## Further reading

<!-- repo-onboard:begin links -->
- [Onboarding](docs/ONBOARDING.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Decision records](docs/adr/README.md)
- [Contributing](CONTRIBUTING.md)
- Skills: [repo-onboard](.agents/skills/repo-onboard/SKILL.md), [run-checks](.agents/skills/run-checks/SKILL.md), [add-adr](.agents/skills/add-adr/SKILL.md)
<!-- repo-onboard:end links -->
