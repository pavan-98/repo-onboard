/**
 * The exact templates written by repo-onboard 1.x. Files whose content still matches them are
 * placeholders and may be replaced; anything else is treated as human-written.
 */
export const V1 = {
  readme: `# Project Name

> One-line description of the project.

## Getting Started

See [docs/ONBOARDING.md](docs/ONBOARDING.md) for setup instructions.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Decisions](docs/DECISIONS.md)
- [Contributing](CONTRIBUTING.md)
`,
  onboarding: `# Onboarding Guide

## 1. Prerequisites
- Node.js (vX.X.X)
- ...

## 2. Installation
\`\`\`bash
npm install
\`\`\`

## 3. Running Locally
\`\`\`bash
npm run dev
\`\`\`
`,
  architecture: `# Architecture Guide

## High-Level Overview
[Describe the system design here]

## Key Components
- **Component A**: Description
- **Component B**: Description
`,
  decisions: `# Decision Log (ADRs)

| ID | Date | Status | Title |
|----|------|--------|-------|
| 001 | YYYY-MM-DD | Accepted | Initial Project Set Up |
`,
  contributing: `# Contributing Guide

1. Fork the repo
2. Create a branch
3. Submit a PR
`,
  aiBase: `# AI Rules & Context

> **Purpose**: This file defines the behavior and context for AI agents working in this repository.

## Core Principles
1. **Read-First**: Always read relevant docs before generating code.
2. **Consistency**: Follow patterns in existing files.
3. **Safety**: Do not delete files without explicit instruction.

## Documentation Map
- Architecture: \`docs/ARCHITECTURE.md\`
- Decisions: \`docs/DECISIONS.md\`
`,
  aiTool: (toolName: string) => `# ${toolName} Instructions

> See \`.ai/_base.md\` for shared context.

## Tool-Specific Rules
- [Add rules specific to ${toolName}]
`,
};

export const V1_AI_FILES: Record<string, string> = {
  '_base.md': V1.aiBase,
  'chatgpt.md': V1.aiTool('ChatGPT'),
  'copilot.md': V1.aiTool('GitHub Copilot'),
  'gemini.md': V1.aiTool('Gemini'),
  'claude.md': V1.aiTool('Claude'),
};

/** Lines a user added to a v1 file, ignoring the template's own lines. */
export function customLines(content: string, template: string): string[] {
  const templateLines = new Set(template.split('\n').map((l) => l.trim()));
  return content.split('\n').filter((line) => line.trim() !== '' && !templateLines.has(line.trim()));
}
