# repo-onboard

[![npm version](https://img.shields.io/npm/v/repo-onboard)](https://www.npmjs.com/package/repo-onboard)
[![CI](https://github.com/pavan-98/repo-onboard/actions/workflows/ci.yml/badge.svg)](https://github.com/pavan-98/repo-onboard/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**One source of truth for every AI coding agent and every new teammate.**

`repo-onboard` reads your repository (package manager, real build/test/lint commands, workspaces, CI,
folder layout) and generates:

- **`AGENTS.md`**: the open standard read by Codex, GitHub Copilot, Cursor, Zed, Aider and others, filled with
  *your actual commands*, not placeholders.
- **Thin adapters** so every other tool uses that same file: `CLAUDE.md` (`@AGENTS.md` import), Gemini CLI
  settings, Copilot instructions and coding-agent setup steps, plus Windsurf, Cline, Junie, Kiro and Aider.
- **Agent Skills** (`.agents/skills/*/SKILL.md`) for running checks, writing ADRs and keeping all of this up to date.
- **Human onboarding docs**: `CONTRIBUTING.md`, `docs/ONBOARDING.md`, `docs/ARCHITECTURE.md`, ADRs,
  `SECURITY.md` and a PR template.

It then **keeps them in sync**. `repo-onboard check` fails CI when a script is renamed, a link breaks, a file
drifts, or `AGENTS.md` grows past what agents will read.

```bash
npx repo-onboard init
```

> Requires Node.js 22.12 or newer. Works on Windows, macOS and Linux.

---

## Why

Every AI tool invented its own instructions file, and most repos end up with five stale copies of the same
advice, or none at all. Agents then guess your test command, run the wrong package manager, or edit
generated files.

`repo-onboard` takes the approach the ecosystem converged on: **one canonical `AGENTS.md`, plus the
smallest native file each tool needs to find it**. The generated sections are rebuilt from the repo, so they
can't rot. Everything you write by hand is left alone.

## Quick start

```bash
# 1. Generate everything (interactive; add --yes to accept defaults)
npx repo-onboard init

# 2. Optional: let the agent you already use draft the prose sections (read-only, you review the diff)
npx repo-onboard draft --with claude      # or codex | gemini | copilot

# 3. Commit, then keep it honest in CI
npx repo-onboard check
```

Preview without writing anything: `npx repo-onboard init --dry-run --diff`.

## What gets generated

| Tool | Files | How it finds `AGENTS.md` |
|---|---|---|
| **All agents** | `AGENTS.md` (+ one per workspace package), `.agents/skills/*/SKILL.md` | native |
| **OpenAI Codex** | `.codex/config.toml` (only for MCP servers) | native |
| **Claude Code** | `CLAUDE.md`, `.claude/settings.json` (allow test/lint commands, deny `.env`), `.claude/skills/*`, `.mcp.json` | `@AGENTS.md` import |
| **GitHub Copilot** | `.github/copilot-instructions.md`, `.github/instructions/tests.instructions.md`, `.github/workflows/copilot-setup-steps.yml`, `.vscode/mcp.json` | native, plus a short summary |
| **Gemini CLI** | `.gemini/settings.json` (`context.fileName`, `mcpServers`) | `context.fileName` |
| Cursor *(opt-in)* | `.cursor/mcp.json` | native |
| Windsurf / Cline / Junie / Kiro *(opt-in)* | one rule file each | pointer / `#[[file:AGENTS.md]]` |
| Aider *(opt-in)* | `.aider.conf.yml` | `read: AGENTS.md` |
| **Humans** | `CONTRIBUTING.md`, `docs/ONBOARDING.md`, `docs/ARCHITECTURE.md`, `docs/adr/`, `SECURITY.md`, `.github/pull_request_template.md`, `README.md` (if missing) | — |

Claude, Codex, Copilot and Gemini are enabled by default. Any other tool whose files already exist in the
repo is enabled automatically, and you can choose with `--targets claude,codex,cursor` or `--targets all`.

Detected ecosystems: **Node.js** (npm, pnpm, yarn, bun, and workspaces with Turborepo, Nx or Lerna), **Python**
(uv, Poetry, PDM, Pipenv, pip), **Go**, **Rust**, **Java/Kotlin** (Gradle, Maven), **.NET**, **Ruby**. Makefile,
justfile and Taskfile targets take priority when they exist.

## How ownership works

Generated content lives between markers:

```md
<!-- repo-onboard:begin commands -->
| Task | Command |
|---|---|
| Test | `pnpm test` |
<!-- repo-onboard:end commands -->
```

- **Inside markers:** owned by repo-onboard and rebuilt by `sync`. Don't edit by hand. Delete the block if
  you want to own that section.
- **Outside markers:** yours, and never modified.
- **JSON/YAML settings** (`.claude/settings.json`, `.gemini/settings.json`, …) are merged key by key, so
  your other settings and JSONC comments are kept.
- **Files you already own** (no markers, no `repo-onboard:generated` tag) are skipped. An existing `AGENTS.md`
  gets the generated sections appended once (disable with `--no-adopt`), and an existing `CLAUDE.md` gets the
  `@AGENTS.md` import prepended.
- **Formatting-only changes** (Prettier table alignment and similar) don't count as drift.
- Line endings are preserved (CRLF stays CRLF).

## Commands

| Command | What it does |
|---|---|
| `init` | Detect the repo, choose tools, write `repo-onboard.config.json` and every file. Flags: `--targets`, `--docs-dir`, `--no-docs`, `--no-skills`, `--no-adopt`, `--draft-with`, `--dry-run`, `--diff`. |
| `sync` | Rebuild managed sections and adapters after the repo or config changes. `--check` exits 1 if anything is out of date. |
| `check` (alias `audit`) | Drift, missing files, commands that no longer exist, broken links, `AGENTS.md` size (Codex reads at most 32 KiB), Copilot's 4,000-character review limit, skill frontmatter, leaked secrets, v1 leftovers, plus a readiness score per tool. `--format text\|json\|github\|sarif`, `--strict`. |
| `doctor` | Shows what each tool will actually load in this repo, and in what order. |
| `draft` | Runs your installed agent CLI (`claude`, `codex`, `gemini`, `copilot`, or `--cmd "<anything>"`) read-only to fill the `TODO(repo-onboard:…)` placeholders. You approve the diff before anything is written. |
| `migrate` | Upgrades a 1.x repo: moves anything you wrote in `.ai/*.md` into `AGENTS.md`, `CLAUDE.md` or the Copilot file, replaces untouched 1.x placeholder docs, and deletes `.ai/`. |
| `add target <ids…>` | Enable more tools. |
| `add skill <name>` | Scaffold a shared Agent Skill in `.agents/skills/` (also exposed to Claude Code). |
| `add adr "<title>"` | Create the next numbered ADR and update the index. |
| `add mcp <name> -- <command…>` / `add mcp <name> <https-url>` | Register an MCP server once and write it in each enabled tool's format. Reference secrets as `${env:VAR}`. |

Global flags: `-C, --cwd <dir>` and `-y, --yes`. Prompts are skipped automatically in CI and when there's no
terminal.

## Configuration

`repo-onboard.config.json` comes with a JSON Schema, so editors autocomplete it:

```json
{
  "$schema": "https://unpkg.com/repo-onboard@2/schema/repo-onboard.schema.json",
  "version": 2,
  "targets": ["claude", "codex", "copilot", "gemini"],
  "docs": { "enabled": true, "dir": "docs" },
  "skills": ["repo-onboard", "run-checks", "add-adr"],
  "nested": false,
  "boundaries": {
    "always": ["Run the lint, type-check and test commands above before saying a task is done."],
    "askFirst": ["Adding, removing or upgrading dependencies."],
    "never": ["Commit secrets, credentials, tokens or `.env` files."]
  },
  "mcpServers": {
    "docs": { "command": "npx", "args": ["-y", "@acme/docs-mcp"], "env": { "TOKEN": "${env:DOCS_TOKEN}" } }
  },
  "ignore": ["playground"]
}
```

After editing, run `npx repo-onboard sync`.

## CI

### GitHub Action

```yaml
# .github/workflows/agents.yml
name: Agent instructions
on: [pull_request]
permissions:
  contents: read
jobs:
  repo-onboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pavan-98/repo-onboard@v2
        with:
          strict: false
```

Findings appear as inline PR annotations and in the job summary.

### Anything else

```bash
npx repo-onboard@2 check --format sarif > repo-onboard.sarif   # code scanning
npx repo-onboard@2 sync --check                                # drift only
```

## Programmatic API

```ts
import { loadContext, runChecks, buildOps, planChanges } from 'repo-onboard';

const { ctx, hasConfig } = await loadContext({ cwd: '/path/to/repo' });
const { findings, scores } = await runChecks(ctx, { hasConfig });
```

## Upgrading from 1.x

```bash
npx repo-onboard@2 migrate --dry-run   # see what happens
npx repo-onboard@2 migrate
```

1.x wrote `.ai/*.md` files, which no AI tool reads. `migrate` keeps every line you added to them, moves
those lines to the file each tool actually reads, and replaces 1.x placeholder docs you never edited.
`audit` still works as an alias of `check`.

## Development

```bash
npm ci
npm run lint && npm run typecheck && npm test && npm run build
node bin/repo-onboard.js doctor
```

See [CONTRIBUTING.md](CONTRIBUTING.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md).
This repository is onboarded with its own tool, and CI runs `repo-onboard check` on it.

## License

[MIT](LICENSE)
