# 2. AGENTS.md as the single source of truth with thin per-tool adapters

- Status: accepted
- Date: 2026-11-23

## Context and problem statement

repo-onboard 1.x wrote `.ai/_base.md` plus one stub per tool (`chatgpt.md`, `copilot.md`, `gemini.md`,
`claude.md`). No AI tool reads `.ai/`, and per-tool copies of the same instructions drift apart. By 2026
the ecosystem had converged on `AGENTS.md` (Linux Foundation AAIF): Codex, Copilot, Cursor, Zed, Aider and
others read it natively, Claude Code can import it from `CLAUDE.md`, and Gemini CLI can load it through
`context.fileName`.

## Considered options

1. Keep generating a full instruction file per tool.
2. Generate one canonical `AGENTS.md` and, per tool, only the minimal native file that points to it.

## Decision

Option 2. `AGENTS.md` (plus nested ones in workspace packages and Agent Skills in `.agents/skills/`) holds
all shared content. Tool targets only add what that tool cannot get from `AGENTS.md`: the `@AGENTS.md`
import and permissions for Claude Code, `context.fileName` for Gemini CLI, a short summary, path
instructions and `copilot-setup-steps.yml` for Copilot, MCP config in each tool's dialect.

## Consequences

- One place to edit; adapters cannot drift because `check` regenerates and compares them.
- A tool that changes its file conventions is a one-file change in `src/targets/`.
- Content that only one tool should see goes in that tool's file, outside repo-onboard's markers.
