import { relLink } from '../core/fs.js';
import { block, todo } from '../core/managed.js';
import type { Context } from '../core/types.js';
import { code, commandsTable, docsPath, find, list, repoMap, stackLines, verifyCommands } from './md.js';

function prerequisites(ctx: Context): string {
  const lines: string[] = ['- Git'];
  for (const eco of ctx.profile.ecosystems) {
    const version = eco.version ? ` ${eco.version}` : '';
    const from = eco.versionFile ? ` (see \`${eco.versionFile}\`)` : '';
    lines.push(`- ${eco.label}${version}${from}`);
    if (
      eco.packageManager &&
      !['go modules', 'cargo', 'NuGet', 'Gradle', 'Maven', 'pip'].includes(eco.packageManager)
    )
      lines.push(`- ${eco.packageManager}`);
  }
  if (ctx.profile.taskRunner) lines.push(`- \`${ctx.profile.taskRunner.tool}\``);
  if (ctx.profile.containers.dockerfile || ctx.profile.containers.compose) lines.push('- Docker');
  return lines.join('\n');
}

function setup(ctx: Context): string {
  const steps: string[] = [];
  const install = find(ctx.profile, 'install');
  steps.push(
    '1. Clone the repository and open a terminal in its root folder.',
    ...install.map((c, i) => `${i + 2}. ${c.scope ? `${c.scope}: ` : ''}${code(c.run)}`),
  );
  let n = install.length + 2;
  if (ctx.profile.envExample)
    steps.push(`${n++}. Copy \`${ctx.profile.envExample}\` to \`.env\` and fill in the values.`);
  if (ctx.profile.containers.compose)
    steps.push(
      `${n++}. Start backing services: \`docker compose -f ${ctx.profile.containers.compose} up -d\``,
    );
  const dev = find(ctx.profile, 'dev');
  if (dev.length) steps.push(`${n++}. Start the app: ${dev.map((c) => code(c.run)).join(' or ')}`);
  const tests = find(ctx.profile, 'test');
  if (tests.length) steps.push(`${n}. Confirm everything works: ${tests.map((c) => code(c.run)).join(', ')}`);
  return steps.join('\n');
}

export function onboardingMd(ctx: Context): string {
  const file = docsPath(ctx, 'ONBOARDING.md');
  return `# Onboarding

Welcome to **${ctx.profile.name}**! This guide gets you from a fresh clone to a tested change.

## Prerequisites

${block('prerequisites', prerequisites(ctx))}

## Setup

${block('setup', setup(ctx))}

## Everyday commands

${block('commands', commandsTable(ctx.profile.commands))}

## Where things live

See [ARCHITECTURE.md](${relLink(file, docsPath(ctx, 'ARCHITECTURE.md'))}) for the repository map and design, and [CONTRIBUTING.md](${relLink(file, 'CONTRIBUTING.md')}) for the workflow.

## Getting help

${todo('help', 'Where should newcomers ask questions? (chat channel, issue tracker, code owners)')}
`;
}

export function architectureMd(ctx: Context): string {
  const file = docsPath(ctx, 'ARCHITECTURE.md');
  return `# Architecture

## Overview

${todo('architecture', 'Explain the system in a few paragraphs: main components, how a request or job flows through them, and external dependencies.')}

## Tech stack

${block('stack', stackLines(ctx.profile).length ? list(stackLines(ctx.profile)) : '_Not detected._')}

## Repository map

${block('repo-map', repoMap(ctx.profile))}

## Key flows

${todo('flows', 'Describe the 2–3 most important flows (e.g. "user signs up", "nightly import") and which modules they touch.')}

## Decisions

Architecture decisions are recorded in [adr/](${relLink(file, docsPath(ctx, 'adr/README.md'))}).
`;
}

export function contributingMd(ctx: Context): string {
  const verify = verifyCommands(ctx.profile);
  const checks = verify.length
    ? verify.map((c) => `- ${c.scope ? `${c.scope}: ` : ''}${code(c.run)}`).join('\n')
    : '_No check commands detected._';
  const commits = ctx.profile.conventionalCommits
    ? 'Use [Conventional Commits](https://www.conventionalcommits.org/): `feat: …`, `fix: …`, `docs: …`, `chore: …`. Tooling enforces this.'
    : 'Write short, imperative commit messages, e.g. "Add retry to upload client".';
  const docs = ctx.config.docs.enabled
    ? `New here? Start with [${docsPath(ctx, 'ONBOARDING.md')}](${docsPath(ctx, 'ONBOARDING.md')}).\n\n`
    : '';
  return `# Contributing

Thanks for contributing to **${ctx.profile.name}**! ${docs}## Workflow

1. Create a branch from the default branch.
2. Make a focused change and add or update tests.
3. Run the checks below; they must pass.
4. Open a pull request using the template and link any related issue.

## Checks

${block('checks', checks)}

## Commit messages

${block('commits', commits)}

## Architecture decisions

Significant decisions are recorded as ADRs in [${docsPath(ctx, 'adr/')}](${docsPath(ctx, 'adr/README.md')}). Create one with \`npx repo-onboard add adr "<title>"\`.

## Working with AI agents

Shared instructions for AI coding agents live in [AGENTS.md](AGENTS.md); tool-specific files (\`CLAUDE.md\`, \`.github/copilot-instructions.md\`, \`.gemini/settings.json\`) point to it. After changing commands or structure, run \`npx repo-onboard sync\`. CI runs \`npx repo-onboard check\`.
`;
}

export function securityMd(ctx: Context): string {
  return `# Security policy

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Report them privately using GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)
(Security tab → "Report a vulnerability").

${todo('security-contact', 'Add an alternative contact (e.g. security@your-domain) and the response time you commit to.')}

## Supported versions

Only the latest release of ${ctx.profile.name} receives security fixes.
`;
}

export function prTemplateMd(ctx: Context): string {
  const verify = verifyCommands(ctx.profile)
    .map((c) => code(c.run))
    .join(', ');
  return `## What and why

<!-- What does this change do, and why is it needed? Link issues with "Fixes #123". -->

## How was it tested?

<!-- Commands you ran, screenshots, or manual steps. -->

## Checklist

- [ ] Checks pass locally${verify ? ` (${verify})` : ''}
- [ ] Tests added or updated
- [ ] Docs and \`AGENTS.md\` updated if commands, structure or conventions changed
${ctx.config.docs.enabled ? '- [ ] ADR added for significant decisions\n' : ''}`;
}

export function readmeMd(ctx: Context): string {
  const install = find(ctx.profile, 'install');
  const dev = find(ctx.profile, 'dev');
  const test = find(ctx.profile, 'test');
  const quick = [...install, ...dev, ...test].map((c) => c.run);
  const docs = ctx.config.docs.enabled
    ? `\n## Documentation\n\n- [Onboarding](${docsPath(ctx, 'ONBOARDING.md')})\n- [Architecture](${docsPath(ctx, 'ARCHITECTURE.md')})\n- [Decision records](${docsPath(ctx, 'adr/README.md')})\n- [Contributing](CONTRIBUTING.md)\n- [Agent instructions](AGENTS.md)\n`
    : '';
  return `# ${ctx.profile.name}

${ctx.profile.description ?? todo('readme', 'One-line description of the project.')}

## Quick start

${quick.length ? `\`\`\`bash\n${quick.join('\n')}\n\`\`\`` : 'See CONTRIBUTING.md.'}
${docs}${ctx.profile.license ? `\n## License\n\n${ctx.profile.license}\n` : ''}`;
}

export function adrTemplate(n: number, title: string, date: string, status = 'proposed'): string {
  return `# ${n}. ${title}

- Status: ${status}
- Date: ${date}

## Context and problem statement

<!-- What problem are we solving? What forces are at play? -->

## Considered options

1. <!-- option -->
2. <!-- option -->

## Decision

<!-- The option chosen and why. -->

## Consequences

<!-- What becomes easier or harder because of this decision? -->
`;
}

export function firstAdr(date: string): string {
  return `# 1. Record architecture decisions

- Status: accepted
- Date: ${date}

## Context and problem statement

We need to remember why the project is built the way it is, for new teammates and for AI agents
that read the repository.

## Decision

We record significant decisions as Architecture Decision Records using the
[MADR](https://adr.github.io/madr/) format, one numbered file per decision in this folder.
New records are created with \`npx repo-onboard add adr "<title>"\`.

## Consequences

Decisions and their trade-offs are discoverable in the repository. Superseded decisions are kept and
marked as such instead of being deleted.
`;
}

export function adrIndex(entries: { file: string; title: string }[]): string {
  const body = entries.length
    ? list(entries.map((e) => `[${e.title}](${e.file})`))
    : '_No decisions recorded yet._';
  return `# Architecture decision records

Each file records one significant decision: its context, the options considered and the consequences.
Create a new one with \`npx repo-onboard add adr "<title>"\`.

${block('index', body)}
`;
}
