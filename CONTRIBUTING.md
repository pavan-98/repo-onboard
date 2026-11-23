# Contributing

Thanks for contributing to **repo-onboard**! New here? Start with [docs/ONBOARDING.md](docs/ONBOARDING.md).

## Workflow

1. Create a branch from the default branch.
2. Make a focused change and add or update tests.
3. Run the checks below; they must pass.
4. Open a pull request using the template and link any related issue.

## Checks

<!-- repo-onboard:begin checks -->
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
<!-- repo-onboard:end checks -->

## Commit messages

<!-- repo-onboard:begin commits -->
Write short, imperative commit messages, e.g. "Add retry to upload client".
<!-- repo-onboard:end commits -->

## Architecture decisions

Significant decisions are recorded as ADRs in [docs/adr/](docs/adr/README.md). Create one with `npx repo-onboard add adr "<title>"`.

## Working with AI agents

Shared instructions for AI coding agents live in [AGENTS.md](AGENTS.md); tool-specific files (`CLAUDE.md`, `.github/copilot-instructions.md`, `.gemini/settings.json`) point to it. After changing commands or structure, run `npx repo-onboard sync`. CI runs `npx repo-onboard check`.
