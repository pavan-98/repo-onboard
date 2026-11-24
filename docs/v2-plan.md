# repo-onboard v2 — Overhaul Plan

_Status: **implemented in 2.0.0** · Date: 2026-11-23_

> **Decisions taken:**
> - All four major tools are on by default.
> - Adapters use imports or pointers, never symlinks, so they work on Windows, macOS and Linux ([ADR 3](adr/0003-link-adapters-by-import-or-pointer-not-symlinks.md)).
> - Everything ships in one release as `repo-onboard` v2.0.0.
> - Seven ecosystems are supported at launch: Node, Python, Go, Rust, JVM, .NET and Ruby.
>
> **Where the implementation differs from this plan, and why:**
> - **Node:** the minimum is ≥ 22.12, not ≥ 20. Node 20 reached end-of-life in April 2026, and commander 15 and Vitest 5 require 22.12.
> - **Build:** plain `tsc` instead of tsdown/tsup. A CLI doesn't need bundling, and this is one less tool.
> - **Templates:** typed TypeScript render functions in `src/templates/` instead of `.eta` files. Most content is conditional, and this avoids a template-engine dependency.
> - **Releases:** a hand-written `CHANGELOG.md` and a manual `npm publish` from the maintainer's machine, instead of Changesets or a CI release workflow. That suits a single maintainer.
> - **Drafting:** `draft` is also its own command, not only `init --draft-with`.
> - **Test fixtures:** built in temporary folders by the tests instead of committed fixture repos. Committed `package.json` files inside the repo would confuse tooling.
> - **Workspaces:** nested `AGENTS.md` files are generated for JavaScript workspaces only. Python, Rust and Go workspaces are detected as single projects for now.

## 1. What the project is today

`repo-onboard` is a TypeScript CLI with two commands. It's about 300 lines of source code.

| Command | What it does                                                                                                                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `init`  | Asks two questions (docs folder, AI files yes/no), then writes static placeholder templates. Files that already exist are skipped. |
| `audit` | Checks that the expected files exist and exits with code 1 if any are missing.                                                     |

It generates:

- **Human docs:** `CONTRIBUTING.md`, `docs/ONBOARDING.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, and a `README.md` if there isn't one.
- **AI files:** `.ai/_base.md` plus `.ai/{chatgpt,copilot,gemini,claude}.md`.

**The core idea is good:** one command makes a repo understandable to both new people and AI agents, and a second command keeps it that way in CI. That idea stays. How it's done needs to change.

## 2. Why it falls short of 2026 standards

| #   | Problem                                                                                                                                                                                                                                                                          | Impact                                                                                                                                                                      |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **No AI tool reads `.ai/`.** Claude Code reads `CLAUDE.md`. Codex, Copilot, Cursor, Zed, Aider and others read `AGENTS.md`. Copilot also reads `.github/copilot-instructions.md`. Gemini CLI reads `GEMINI.md`, or `AGENTS.md` if `.gemini/settings.json` points to it.          | The AI files the tool generates have no effect.                                                                                                                             |
| 2   | **The per-tool files are near-identical empty stubs.**                                                                                                                                                                                                                           | Content is duplicated and drifts apart. The industry has moved to a single canonical file (`AGENTS.md`) with thin per-tool adapters.                                        |
| 3   | **ChatGPT is listed, but Codex, Cursor and Windsurf aren't.**                                                                                                                                                                                                                    | The tools listed don't match the agents people use on repos today.                                                                                                          |
| 4   | **The templates don't look at the repo.** They're placeholders like `npm run dev` and `Node.js (vX.X.X)`.                                                                                                                                                                        | Agents work best when given _real_ build, test and lint commands. Placeholders are worse than nothing because agents trust them.                                            |
| 5   | **`audit` only checks that files exist.**                                                                                                                                                                                                                                        | It misses stale commands, broken links, oversized context files, drift between adapters, and invalid frontmatter.                                                           |
| 6   | **The config chosen at `init` isn't saved.**                                                                                                                                                                                                                                     | `audit` always expects AI files, even if the user said no, and always assumes `docs/`. The `aiBase` and `readme` templates hard-code `docs/` even when `--docs-dir` is set. |
| 7   | **It doesn't cover skills, MCP config, agent environment setup, or path-scoped rules.**                                                                                                                                                                                          | These are now the main places agent behaviour is configured (§3).                                                                                                           |
| 8   | **Engineering hygiene:** the version is hard-coded to `1.0.0` while the package is at `1.0.2`. There are no tests (`npm test` exits 1), no CI, and no lint. Prompts crash when there's no terminal (non-TTY) unless `-y` is passed. Templates are written as TypeScript strings. | Hard to maintain and to accept contributions.                                                                                                                               |

## 3. The 2026 landscape we target

| Tool                                                         | Instructions it reads                                                                                                                                | Other config it reads                                                                                                                                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AGENTS.md (open standard, Linux Foundation AAIF)**         | `AGENTS.md`, nested per folder; the closest file to the code wins                                                                                    | —                                                                                                                                                                            |
| **OpenAI Codex**                                             | `AGENTS.md` natively                                                                                                                                 | Skills in `.agents/skills/*/SKILL.md`; MCP in `.codex/config.toml`                                                                                                           |
| **Claude Code**                                              | `CLAUDE.md`, which can import `@AGENTS.md`                                                                                                           | `.claude/settings.json` (permissions, hooks), `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, `.mcp.json`                                                         |
| **GitHub Copilot** (VS Code, coding agent, code review, CLI) | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` (with an `applyTo:` path pattern), `AGENTS.md`, `CLAUDE.md`, `GEMINI.md` | `.github/agents/*.md` (custom agents), `.github/prompts/`, skills, `.vscode/mcp.json`, `.github/workflows/copilot-setup-steps.yml` (prepares the coding agent's environment) |
| **Gemini CLI**                                               | `GEMINI.md`, or `AGENTS.md` via `.gemini/settings.json` → `context.fileName`                                                                         | `.gemini/commands/*.toml`, `mcpServers` in settings, skills                                                                                                                  |
| **Cursor / Windsurf / Cline / Junie / Kiro / Aider**         | `AGENTS.md`, plus their own rule folders (`.cursor/rules/*.mdc`, `.windsurf/rules/`, `.clinerules/`, `.junie/`, `.kiro/steering/`)                   | Their own MCP files                                                                                                                                                          |
| **Agent Skills (`SKILL.md`, open standard, AAIF)**           | Folders with `name` and `description` frontmatter, loaded only when relevant                                                                         | Read by Claude, Codex, Copilot, Gemini, Cursor and others                                                                                                                    |

> Exact paths and keys change quickly. Each adapter (§4.3) will declare which doc version it targets and have tests, so a change in one tool is a one-file update.

## 4. The new concept: one source of truth for every agent

```
             ┌──────────── detect ────────────┐
  repo  ───► │ stack, package manager, scripts,│ ──► RepoProfile (JSON)
             │ monorepo, CI, existing agent files│
             └─────────────────────────────────┘
                              │
                              ▼
          Canonical layer (committed, owned by humans)
          AGENTS.md  ·  .agents/skills/*  ·  repo-onboard.config.json
                              │
          ┌──────────┬────────┼─────────┬──────────┬──────────┐
          ▼          ▼        ▼         ▼          ▼          ▼
       claude     codex    copilot   gemini     cursor    (plugins)
      adapters   adapters  adapters  adapters  adapters
                              │
                              ▼
        check / doctor: drift, staleness, size, links, CI gate
```

Principles:

1. **`AGENTS.md` is the single source of truth.** Every tool-specific file is a thin pointer or import, never a copy.
2. **Use real facts, not placeholders.** Commands, versions and folder layout come from scanning the repo.
3. **Never overwrite what a human wrote.** Generated content goes inside managed blocks (`<!-- repo-onboard:begin id -->` … `<!-- repo-onboard:end -->`). Anything outside the markers is never touched. JSON and TOML files are merged, not replaced.
4. **Every run gives the same result for the same repo.** Output can be checked in CI with `repo-onboard check`.
5. **The core works offline with no API keys.** AI drafting is opt-in and uses the agent CLI the user already has installed.

### 4.1 Detection (`src/detect/`)

The detectors build a typed `RepoProfile` covering:

- **Languages and package managers:** npm, pnpm, yarn, bun, uv, poetry, pip, go, cargo, gradle, maven, dotnet, bundler.
- **Runnable commands:** `package.json` scripts, `Makefile` and `justfile` targets, `pyproject` scripts, `Taskfile`.
- **Repo shape and tooling:**
  - Monorepos: workspaces, turbo, nx.
  - Test frameworks and linters/formatters.
  - CI: GitHub Actions jobs.
  - Docker and devcontainer setup.
  - `.env.example`.
- **What already exists:** current agent files, including the legacy `.ai/` folder.

### 4.2 Canonical files

- **`AGENTS.md`**, with these sections:
  - Overview
  - Repo map
  - Setup, Build, Test and Lint commands (real ones, with the faster single-test variant where one exists)
  - Code style
  - Testing rules
  - Commit and PR conventions
  - **Boundaries: Always / Ask first / Never**
  - Security notes

  It has a size budget, warning above ~16 KB (Codex truncates project docs at 32 KiB by default). Monorepos get nested `AGENTS.md` files per package.
- **`.agents/skills/`:** optional starter skills such as `run-tests`, `add-adr`, and `release`.
- **`repo-onboard.config.json`:** stores the chosen targets, docs folder, boundaries and MCP servers. It has a published JSON Schema. This fixes problem 6.

### 4.3 Adapters (`src/targets/<tool>.ts`, one plugin interface)

```ts
interface Target {
  id: 'claude' | 'codex' | 'copilot' | 'gemini' | 'cursor' | string;
  detect(profile: RepoProfile): boolean; // is this tool in use here?
  plan(ctx: Context): FileOp[]; // create / merge / managed-block ops
  check(ctx: Context): Finding[]; // tool-specific validation
}
```

| Target                | Files it generates                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **claude**            | `CLAUDE.md` (starts with `@AGENTS.md`, plus Claude-only notes). `.claude/settings.json` that allows the detected test and lint commands. `.claude/skills/` linking to the canonical skills. Optionally `.mcp.json`.                                                                                                                                |
| **codex**             | None needed for instructions, since Codex reads `AGENTS.md`. Optionally `.codex/config.toml` for MCP. Skills already live in `.agents/skills`.                                                                                                                                                                                                     |
| **copilot**           | Short `.github/copilot-instructions.md` (points to `AGENTS.md` and lists the key commands). `.github/instructions/*.instructions.md` with `applyTo` per detected area (tests, frontend, infra). **`.github/workflows/copilot-setup-steps.yml` built from the detected install commands.** Optionally `.vscode/mcp.json` and `.github/agents/*.md`. |
| **gemini**            | `.gemini/settings.json` merged with `context.fileName: ["AGENTS.md", "GEMINI.md"]`. Optionally a `GEMINI.md` stub.                                                                                                                                                                                                                                 |
| **cursor**            | Optionally `.cursor/rules/*.mdc` for path-scoped rules. Cursor already reads `AGENTS.md`.                                                                                                                                                                                                                                                          |
| **later / community** | windsurf, cline, junie, kiro, aider (`read: AGENTS.md`).                                                                                                                                                                                                                                                                                           |

How the link to `AGENTS.md` is made, per adapter:

- **import** (default): works on every OS.
- **symlink** (opt-in): not reliable on Windows.
- **copy** (last resort): kept in sync by hash.

### 4.4 Human docs (kept, but upgraded)

- **Filled from `RepoProfile`:**
  - `CONTRIBUTING.md`: real commands, branch and commit conventions.
  - `docs/ONBOARDING.md`: real prerequisites and versions.
  - `docs/ARCHITECTURE.md`: repo map.
- **Decision records:** `docs/DECISIONS.md` becomes `docs/adr/NNNN-title.md` in the MADR format, plus an `adr new` subcommand.
- **Optional extras:** `SECURITY.md`, `.github/pull_request_template.md`, `CODEOWNERS` stub.
- **README:** generated only if missing. Links follow the configured docs folder.

### 4.5 Optional AI drafting: the user's own agent

- **`init --draft-with <claude|codex|gemini|copilot>`:** runs the installed agent CLI in non-interactive mode with a bundled prompt and the `RepoProfile`. The agent drafts the prose sections (Overview, Architecture, Code style).
  - The draft goes **only into managed blocks**, and is shown as a diff before anything is written.
  - The tool never stores API keys.
- **Bundled skill `.agents/skills/repo-onboard/SKILL.md`:** any agent can run "onboard this repo" or "refresh AGENTS.md" itself.

## 5. New command-line interface

| Command                                      | Purpose                                                                                                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `repo-onboard init`                          | Detect, then show the plan (files and diffs), confirm, write. Flags: `--targets claude,codex,copilot,gemini`, `--yes`, `--dry-run`, `--json`, `--draft-with`.            |
| `repo-onboard sync`                          | Regenerate managed blocks and adapters from the config and `AGENTS.md`. Running it twice changes nothing.                                                                |
| `repo-onboard check`                         | Replaces `audit`, which stays as an alias. See the checks listed below the table. Output formats: human, `--json`, `--format github` (PR annotations), `--format sarif`. |
| `repo-onboard doctor`                        | Shows **what each tool will actually load** in this repo (a context map). Explains the precedence when multiple files conflict.                                          |
| `repo-onboard migrate`                       | Moves v1 `.ai/*` into `AGENTS.md` plus adapters, keeping any custom content.                                                                                             |
| `repo-onboard add <target\|skill\|adr>`      | Adds a target, a starter skill or an ADR later.                                                                                                                          |
| **GitHub Action** `pavan-98/repo-onboard@v2` | Runs `check` on PRs and can comment the score.                                                                                                                           |

`check` covers:

- Missing files.
- Commands referenced in the docs that no longer exist in `package.json`, the Makefile, etc.
- Broken relative links.
- `AGENTS.md` over its size budget.
- Adapters that have drifted from their source.
- Invalid `SKILL.md` or `.instructions.md` frontmatter.
- `.gemini/settings.json` not pointing to `AGENTS.md`.
- Secrets pasted into context files.
- A per-tool readiness score.

## 6. Engineering modernisation

- **Runtime:** Node ≥ 20 (test on 20, 22 and 24). ESM only. The version is read from `package.json`.
- **Build:** `tsdown` or `tsup` to bundle, with an `exports` map. Templates move to real `.md` files under `templates/`, rendered with a small templating library.
- **Fewer dependencies:**

  | Remove     | Replace with                                                 |
  | ---------- | ------------------------------------------------------------ |
  | `fs-extra` | `node:fs/promises`                                           |
  | `chalk`    | `node:util.styleText`                                        |
  | `inquirer` | `@clack/prompts`, with an automatic non-interactive fallback |

- **Tests:**
  - Vitest with **fixture repos** (node-pnpm, python-uv, go, monorepo-turbo, legacy-v1-.ai, empty).
  - Snapshot tests of the generated file tree.
  - An end-to-end test that runs the built binary in temporary folders.
  - A test that running `sync` twice changes nothing.
- **Quality:** Biome for linting and formatting, `tsc --noEmit` in CI.
- **CI and release:**
  - GitHub Actions on Ubuntu, macOS and Windows.
  - Changesets to manage versions and changelogs.
  - **npm trusted publishing (OIDC) with provenance**, with no npm token stored in the repo.
- **Use it on itself:** this repo carries its own `AGENTS.md`, `CLAUDE.md`, Copilot and Gemini adapters, generated by `repo-onboard`, and CI runs `repo-onboard check` on itself.
- **Release as v2.0.0:** the output layout is a breaking change. `migrate` and the `audit` alias soften it.

## 7. Phased delivery

| Phase                           | Scope                                                                                                                                                                                                                                              | Exit criteria                                                                                         |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **0. Foundation**               | Tooling swap (build, Vitest, Biome, CI, changesets). Fix the v1 bugs (version, saved config, `docsDir` links, non-TTY crash). Templates moved to files. Add `AGENTS.md`/`CLAUDE.md` to this repo.                                                  | CI green on 3 operating systems. Tests cover the existing behaviour.                                  |
| **1. Canonical + big 4**        | `RepoProfile` detection (Node and Python first). `AGENTS.md` generator with managed blocks. Adapters for claude, codex, copilot and gemini. `init --dry-run`, `sync`, `migrate`.                                                                   | Fixture snapshots pass. A real repo onboarded in under 30 seconds. Re-running `sync` changes nothing. |
| **2. Check & CI**               | `check` with all rules, `doctor` context map, JSON/GitHub/SARIF output, GitHub Action.                                                                                                                                                             | Action published. This repo gates its own PRs with it.                                                |
| **3. Depth**                    | Skills (`.agents/skills` + starter set). Copilot path instructions and `copilot-setup-steps.yml`. Claude permissions. Fan-out of one MCP config to every tool. ADR subcommand. More languages (Go, Rust, Java, .NET). Monorepo nested `AGENTS.md`. | Each adapter has docs, tests and a pinned "verified against" date.                                    |
| **4. Intelligence & ecosystem** | `--draft-with` agent drafting. Bundled repo-onboard skill. Cursor, Windsurf, Cline, Junie, Kiro adapters. Plugin API for third-party targets. Docs site with `llms.txt`.                                                                           | v2.0.0 released.                                                                                      |

## 8. Proposed source layout

```
src/
  cli.ts                     # commander wiring
  commands/{init,sync,check,doctor,migrate,add}.ts
  detect/{index,node,python,go,rust,jvm,dotnet,ci,monorepo,existing}.ts
  core/{profile,config,plan,apply,managed-blocks,merge-json,render}.ts
  targets/{claude,codex,copilot,gemini,cursor,index}.ts
  checks/{presence,commands,links,size,drift,frontmatter,secrets}.ts
templates/
  agents/AGENTS.md.eta  human/*.md.eta  skills/*/SKILL.md  copilot/*.eta ...
schema/repo-onboard.schema.json
test/fixtures/<repo-kinds>/  test/**/*.test.ts
action.yml
```

## 9. Decisions needed from the maintainer

1. **Default targets:** all four big tools (claude, codex, copilot, gemini), or only the ones whose usage is detected?
2. **How adapters link to `AGENTS.md`:** import as the default (recommended), or symlink?
3. **AI drafting (`--draft-with`):** include it in v2.0, or ship it as a fast follow?
4. **Name and version:** keep `repo-onboard` and release as v2.0.0 (recommended), or rebrand?
5. **Languages for the first release:** Node and Python only, or more?
