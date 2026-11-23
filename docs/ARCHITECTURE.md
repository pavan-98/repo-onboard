# Architecture

## Overview

`repo-onboard` is a Node.js CLI (and small library) that keeps AI-agent instructions and human onboarding docs in sync with the repository they describe. Every command follows the same pipeline:

1. **Detect** (`src/detect/`) reads manifests, lockfiles, task runners, CI workflows and the git file list and builds a `RepoProfile`: languages, package managers, real build/test/lint commands, workspaces, folders and existing agent files.
2. **Configure** (`src/core/config.ts`, `src/core/context.ts`) loads `repo-onboard.config.json` (targets, docs folder, skills, boundaries, MCP servers) and combines it with the profile into a `Context`.
3. **Plan** (`src/targets/`, `src/templates/`) turns the context into `FileOp`s. `core.ts` produces the canonical files (`AGENTS.md`, Agent Skills, human docs); each tool target (`claude.ts`, `copilot.ts`, `tools.ts`) adds thin adapters that point back to `AGENTS.md`.
4. **Diff and apply** (`src/core/plan.ts`, `src/core/managed.ts`, `src/core/data.ts`) compares each op with the file on disk. Markdown is only changed inside `<!-- repo-onboard:begin/end -->` blocks; JSON/YAML/TOML are merged key by key, preserving comments where the format allows; files a human owns are skipped.
5. **Check** (`src/checks/`) re-runs the plan without writing to detect drift, then adds content rules (stale commands, broken links, size limits, skill frontmatter, secrets) and reports them as text, JSON, GitHub annotations or SARIF (`src/report/`).

There is no network access and no LLM call in the core. `draft` (`src/draft/`) optionally shells out to an agent CLI the user already has (`claude`, `codex`, `gemini`, `copilot`) and only replaces `TODO(repo-onboard:…)` placeholder lines after showing a diff.

## Tech stack

<!-- repo-onboard:begin stack -->
- **TypeScript on Node.js** >=22.12 (from `package.json`) · package manager: npm · tooling: Vitest, Biome
- **CI:** GitHub Actions
<!-- repo-onboard:end stack -->

## Repository map

<!-- repo-onboard:begin repo-map -->
- `.github/` — GitHub workflows, templates and Copilot config
- `bin/` — Executable entry points
- `docs/` — Documentation
- `schema/` — Schemas
- `src/` — Source code
- `test/` — Tests
<!-- repo-onboard:end repo-map -->

## Key flows

- **`init`**: detect → build default config (enabled targets = the big four + any tool already present) → optional prompts → plan (including the config file) → print plan → confirm → write → optional `draft`.
- **`sync` / `check`**: load config → detect → plan. `sync` writes the changes; `sync --check` and `check` only report them (`check` adds the content rules and per-tool readiness scores). CI runs `check` through `action.yml`.
- **`migrate`**: read the 1.x `.ai/*.md` files, keep only lines that differ from the 1.x templates, run the normal plan (1.x placeholder docs count as replaceable), append the kept notes to `AGENTS.md` / `CLAUDE.md` / Copilot / `GEMINI.md`, then delete `.ai/`.

## Decisions

Architecture decisions are recorded in [adr/](adr/README.md).
