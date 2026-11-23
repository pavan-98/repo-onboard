# Onboarding

Welcome to **repo-onboard**! This guide gets you from a fresh clone to a tested change.

## Prerequisites

<!-- repo-onboard:begin prerequisites -->
- Git
- Node.js >=22.12 (see `package.json`)
- npm
<!-- repo-onboard:end prerequisites -->

## Setup

<!-- repo-onboard:begin setup -->
1. Clone the repository and open a terminal in its root folder.
2. `npm ci`
3. Start the app: `npm run dev`
4. Confirm everything works: `npm test`
<!-- repo-onboard:end setup -->

## Everyday commands

<!-- repo-onboard:begin commands -->
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

## Where things live

See [ARCHITECTURE.md](ARCHITECTURE.md) for the repository map and design, and [CONTRIBUTING.md](../CONTRIBUTING.md) for the workflow.

## Getting help

Open an issue at https://github.com/pavan-98/repo-onboard/issues. For a new AI tool or file format, include a link to the tool's official documentation.
