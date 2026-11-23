---
name: repo-onboard
description: Keep AGENTS.md, CLAUDE.md, Copilot and Gemini config, skills and onboarding docs accurate. Use after changing build or test commands or project structure, or when asked to update agent instructions or onboarding docs.
---

# Maintain onboarding and agent instructions

This repository uses [repo-onboard](https://www.npmjs.com/package/repo-onboard). `AGENTS.md` is the single source of
truth; tool-specific files only point to it.

1. Run `npx repo-onboard check` and read the findings.
2. Change settings (targets, boundaries, MCP servers, skills) in `repo-onboard.config.json`.
3. Run `npx repo-onboard sync` to regenerate managed sections and adapters. Never edit text between
   `<!-- repo-onboard:begin … -->` and `<!-- repo-onboard:end … -->` by hand.
4. Replace any `TODO(repo-onboard:…)` placeholders with accurate content, based on reading the code.
   Keep `AGENTS.md` short and specific: commands, conventions and boundaries, not general advice.
5. Run `npx repo-onboard check` again; it must report no errors.
