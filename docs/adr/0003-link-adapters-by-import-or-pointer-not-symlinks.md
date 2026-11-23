# 3. Link adapters by import or pointer, not symlinks

- Status: accepted
- Date: 2026-11-23

## Context and problem statement

A common way to share `AGENTS.md` is to symlink `CLAUDE.md` or `GEMINI.md` to it. repo-onboard must work
the same on Windows, macOS and Linux.

## Considered options

1. Symlinks (`CLAUDE.md -> AGENTS.md`).
2. Copies kept in sync by hash.
3. Native import or settings where the tool supports it (`@AGENTS.md`, `context.fileName`, Kiro
   `#[[file:AGENTS.md]]`, Aider `read:`), and a one-line pointer file elsewhere.

## Decision

Option 3. Symlinks need Developer Mode or admin rights on Windows and are often checked out as plain text
files there (`core.symlinks=false`). Copies duplicate content and context tokens.

## Consequences

- Works identically on all three operating systems and in any git client.
- Pointer files rely on the agent following one instruction ("read AGENTS.md"), which is reliable for
  current agents; native imports are used wherever a tool offers them.
