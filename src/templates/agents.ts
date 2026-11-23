import { relLink } from '../core/fs.js';
import { block, todo } from '../core/managed.js';
import type { Context, WorkspacePackage } from '../core/types.js';
import { code, commandsTable, docsPath, find, list, repoMap, stackLines, verifyCommands } from './md.js';

function testingBody(ctx: Context): string {
  const { profile } = ctx;
  const lines: string[] = [];
  const tests = find(profile, 'test');
  if (tests.length) {
    lines.push(`- Run the full suite: ${tests.map((t) => code(t.run)).join(', ')}`);
  } else {
    lines.push('- No test command was detected. Ask before adding a test framework.');
  }
  for (const eco of profile.ecosystems) {
    if (eco.singleTest) {
      const scope = profile.ecosystems.length > 1 ? ` (${eco.language})` : '';
      lines.push(`- Run one test${scope}: ${code(eco.singleTest)}`);
    }
  }
  const globs = [...new Set(profile.ecosystems.flatMap((e) => e.testGlobs))];
  if (globs.length) lines.push(`- Test files: ${globs.map(code).join(', ')}`);
  lines.push('- Add or update tests for every behaviour change; prefer running the narrowest test first.');
  return lines.join('\n');
}

function verifyBody(ctx: Context): string {
  const verify = verifyCommands(ctx.profile);
  if (verify.length === 0) return '_No verification commands detected._';
  return [
    'Before you finish, run these in order and fix any failures:',
    '',
    ...verify.map((c, i) => `${i + 1}. ${code(c.run)}`),
  ].join('\n');
}

function boundariesBody(ctx: Context): string {
  const { always, askFirst, never } = ctx.config.boundaries;
  return [
    '**Always**',
    '',
    list(always),
    '',
    '**Ask first**',
    '',
    list(askFirst),
    '',
    '**Never**',
    '',
    list(never),
    '',
    `_Edit these in \`repo-onboard.config.json\` → \`boundaries\`, then run \`npx repo-onboard sync\`._`,
  ].join('\n');
}

function gitBody(ctx: Context): string {
  const lines: string[] = [];
  if (ctx.profile.conventionalCommits)
    lines.push(
      '- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:` …). This is enforced by tooling.',
    );
  else lines.push('- Write short, imperative commit messages (e.g. "Add retry to upload client").');
  lines.push('- Keep pull requests focused on one change and describe how it was tested.');
  if (ctx.config.docs.enabled)
    lines.push(
      `- Record significant decisions as an ADR in \`${docsPath(ctx, 'adr/')}\` (\`npx repo-onboard add adr "<title>"\`).`,
    );
  const ciRuns = ctx.profile.ci.flatMap((c) => c.runSteps).slice(0, 6);
  if (ciRuns.length) lines.push(`- CI runs: ${ciRuns.map(code).join(', ')}`);
  return lines.join('\n');
}

function linksBody(ctx: Context): string {
  const links: string[] = [];
  if (ctx.config.docs.enabled) {
    links.push(
      `[Onboarding](${docsPath(ctx, 'ONBOARDING.md')})`,
      `[Architecture](${docsPath(ctx, 'ARCHITECTURE.md')})`,
      `[Decision records](${docsPath(ctx, 'adr/README.md')})`,
      '[Contributing](CONTRIBUTING.md)',
    );
  }
  if (ctx.config.skills.length)
    links.push(`Skills: ${ctx.config.skills.map((s) => `[${s}](.agents/skills/${s}/SKILL.md)`).join(', ')}`);
  return links.length ? list(links) : '_No linked docs._';
}

export function agentsMd(ctx: Context): string {
  const { profile } = ctx;
  const overview = profile.description
    ? profile.description
    : todo(
        'overview',
        'Describe in 2–4 sentences what this project does, who uses it and the main moving parts.',
      );
  const human = ctx.config.docs.enabled
    ? ` Humans: start with [CONTRIBUTING.md](CONTRIBUTING.md) and [${docsPath(ctx, 'ONBOARDING.md')}](${docsPath(ctx, 'ONBOARDING.md')}).`
    : '';

  return `# AGENTS.md

Instructions for AI coding agents (Codex, Claude Code, GitHub Copilot, Gemini CLI, Cursor and others) working in **${profile.name}**.${human}

Sections between \`repo-onboard\` markers are generated from the repository by [repo-onboard](https://www.npmjs.com/package/repo-onboard) — run \`npx repo-onboard sync\` instead of editing them. Everything else is yours to edit.

## Project overview

${overview}

${block('stack', stackLines(profile).length ? list(stackLines(profile)) : '_No language or runtime detected._')}

## Commands

${block('commands', `Run from the repository root.\n\n${commandsTable(profile.commands)}`)}

## Repository map

${block('repo-map', repoMap(profile))}

## Code style

- Match the conventions of the surrounding code and nearby files before introducing new patterns.
- ${todo('code-style', 'List the conventions that matter here (naming, error handling, module layout, preferred libraries).')}

## Testing

${block('testing', testingBody(ctx))}

## Definition of done

${block('verify', verifyBody(ctx))}

## Boundaries

${block('boundaries', boundariesBody(ctx))}

## Commits and pull requests

${block('git', gitBody(ctx))}

## Further reading

${block('links', linksBody(ctx))}
`;
}

export function nestedAgentsMd(_ctx: Context, ws: WorkspacePackage): string {
  const file = `${ws.dir}/AGENTS.md`;
  const rootLink = relLink(file, 'AGENTS.md');
  const body = ws.commands.length
    ? `Run from the repository root.\n\n${commandsTable(ws.commands)}`
    : '_This package defines no scripts; use the root commands._';
  return `# AGENTS.md — ${ws.name}

Package-specific instructions. The [root AGENTS.md](${rootLink}) also applies; where they conflict, this file wins for files in \`${ws.dir}/\`.

${ws.description ?? todo('package-overview', `Describe what \`${ws.name}\` is responsible for and what depends on it.`)}

## Commands

${block('commands', body)}

## Notes

- Keep changes inside this package unless the task requires otherwise.
`;
}
