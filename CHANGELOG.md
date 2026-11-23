# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## 2.0.0 — 2026-11-23

A complete rewrite around the 2026 AI-tooling standards. See the [plan](docs/v2-plan.md) and
[ADR 2](docs/adr/0002-agents-md-as-the-single-source-of-truth-with-thin-per-tool.md).

### Breaking

- Generates **`AGENTS.md`** plus native per-tool files instead of `.ai/*.md` (which no tool reads). Run
  `npx repo-onboard migrate` to upgrade; it keeps anything you wrote in `.ai/`.
- Requires **Node.js ≥ 22.12** (Node 20 reached end-of-life in April 2026).
- `audit` is now `check` (`audit` remains as an alias) and checks content, not only whether files exist.
- `docs/DECISIONS.md` is replaced by one file per decision in `docs/adr/` (MADR format).
- ChatGPT-specific output was removed. Codex and ChatGPT agents read `AGENTS.md`.

### Added

- Repository detection for Node.js (npm/pnpm/yarn/bun, workspaces, Turborepo/Nx/Lerna), Python
  (uv/Poetry/PDM/Pipenv/pip), Go, Rust, Gradle/Maven, .NET and Ruby, plus Makefile/justfile/Taskfile, CI,
  containers and env examples. Generated docs contain your **real commands**.
- Adapters for Claude Code, Codex, GitHub Copilot (instructions, path instructions, coding-agent setup steps),
  Gemini CLI, Cursor, Windsurf, Cline, Junie, Kiro and Aider.
- Agent Skills in `.agents/skills/` (`repo-onboard`, `run-checks`, `add-adr`), exposed to Claude Code.
- One MCP server definition fanned out to `.mcp.json`, `.vscode/mcp.json`, `.gemini/settings.json`,
  `.cursor/mcp.json` and `.codex/config.toml`.
- Managed blocks: regenerate safely without touching human-written text. JSON/YAML/TOML are merged and
  JSONC comments preserved.
- Commands: `sync`, `check` (text/JSON/GitHub/SARIF), `doctor`, `draft` (uses your installed agent CLI),
  `migrate`, `add target|skill|adr|mcp`.
- `repo-onboard.config.json` with a published JSON Schema.
- GitHub Action (`pavan-98/repo-onboard@v2`).
- Programmatic API (`import { runChecks } from 'repo-onboard'`).

### Fixed

- `--version` reported `1.0.0` regardless of the installed version.
- `audit` ignored the docs folder and AI choices made at `init`.
- Generated links pointed to `docs/` even with a custom `--docs-dir`.
- Prompts crashed when there was no terminal attached.

## 1.0.2

- Add MIT license file.

## 1.0.1

- Add repository metadata and keywords.

## 1.0.0

- Initial release: `init` and `audit`, human docs and `.ai/` reference files.
