import path from 'node:path';
import { stringify } from 'yaml';
import { exists, listDir } from '../core/fs.js';
import { block, GENERATED_MARKER } from '../core/managed.js';
import type { Context, Ecosystem, FileOp, Target } from '../core/types.js';
import { code, commandsTable, find, list } from '../templates/md.js';
import { mcpEdits, vscodeMcp } from './mcp.js';

/** Copilot code review reads only the first ~4,000 characters of instruction files. */
export const COPILOT_REVIEW_LIMIT = 4000;

function instructions(ctx: Context): string {
  const verify = ['lint', 'typecheck', 'test', 'build'] as const;
  const key = ctx.profile.commands.filter((c) => (verify as readonly string[]).includes(c.kind));
  const body = `# Copilot instructions

The shared instructions for every AI agent in this repository are in [AGENTS.md](../AGENTS.md). Read it before making changes; it has the commands, repository map, testing rules and boundaries.

## Key commands

${commandsTable(key)}

## Never

${list(ctx.config.boundaries.never)}`;
  return `${block('summary', body)}

<!-- Add Copilot-specific notes below this line. -->
`;
}

function testInstructions(ctx: Context): string | undefined {
  const globs = [...new Set(ctx.profile.ecosystems.flatMap((e) => e.testGlobs))];
  const tests = find(ctx.profile, 'test');
  if (globs.length === 0 || tests.length === 0) return undefined;
  const single = ctx.profile.ecosystems
    .filter((e) => e.singleTest)
    .map((e) => `- Run one test: ${code(e.singleTest!)}`);
  return `---
applyTo: ${JSON.stringify(globs.join(','))}
---
<!-- ${GENERATED_MARKER}: change test commands in your manifest, then run \`npx repo-onboard sync\` -->

# Tests

- Run the suite with ${tests.map((t) => code(t.run)).join(', ')}.
${single.join('\n')}${single.length ? '\n' : ''}- Cover new behaviour and regressions with tests next to the existing ones; follow their structure and naming.
- Never skip, delete or weaken assertions to make a test pass. Fix the code or ask.
`;
}

type Step = Record<string, unknown>;

function nodeVersionInput(eco: Ecosystem): Record<string, string> {
  if (eco.versionFile === '.nvmrc' || eco.versionFile === '.node-version')
    return { 'node-version-file': eco.versionFile };
  if (eco.version && /^\d+(\.\d+){0,2}(\.x)?$/.test(eco.version)) return { 'node-version': eco.version };
  return { 'node-version': 'lts/*' };
}

function setupSteps(ctx: Context): Step[] {
  const steps: Step[] = [{ name: 'Check out code', uses: 'actions/checkout@v7' }];
  for (const eco of ctx.profile.ecosystems) {
    const install = eco.commands.find((c) => c.kind === 'install')?.run;
    switch (eco.id) {
      case 'node': {
        const pm = eco.packageManager ?? 'npm';
        if (pm === 'pnpm') steps.push({ name: 'Set up pnpm', uses: 'pnpm/action-setup@v6' });
        if (pm === 'bun') {
          steps.push({ name: 'Set up Bun', uses: 'oven-sh/setup-bun@v2' });
        } else {
          steps.push({
            name: 'Set up Node.js',
            uses: 'actions/setup-node@v7',
            with: { ...nodeVersionInput(eco), ...(pm !== 'yarn' || install ? { cache: pm } : {}) },
          });
        }
        if (pm === 'yarn' && install?.includes('--immutable'))
          steps.push({ name: 'Enable Corepack', run: 'corepack enable' });
        break;
      }
      case 'python':
        if (eco.packageManager === 'uv') {
          steps.push({ name: 'Set up uv', uses: 'astral-sh/setup-uv@v7' });
        } else {
          steps.push({
            name: 'Set up Python',
            uses: 'actions/setup-python@v7',
            with:
              eco.versionFile === '.python-version'
                ? { 'python-version-file': '.python-version' }
                : { 'python-version': '3.x' },
          });
          if (eco.packageManager && eco.packageManager !== 'pip')
            steps.push({ name: `Install ${eco.packageManager}`, run: `pipx install ${eco.packageManager}` });
        }
        break;
      case 'go':
        steps.push({ name: 'Set up Go', uses: 'actions/setup-go@v7', with: { 'go-version-file': 'go.mod' } });
        break;
      case 'rust':
        steps.push({
          name: 'Set up Rust',
          uses: 'dtolnay/rust-toolchain@stable',
          with: { components: 'clippy, rustfmt' },
        });
        break;
      case 'jvm':
        steps.push({
          name: 'Set up Java',
          uses: 'actions/setup-java@v6',
          with: { distribution: 'temurin', 'java-version': eco.version ?? '21' },
        });
        break;
      case 'dotnet':
        steps.push({
          name: 'Set up .NET',
          uses: 'actions/setup-dotnet@v6',
          with:
            eco.versionFile === 'global.json'
              ? { 'global-json-file': 'global.json' }
              : { 'dotnet-version': '10.0.x' },
        });
        break;
      case 'ruby':
        steps.push({ name: 'Set up Ruby', uses: 'ruby/setup-ruby@v1', with: { 'bundler-cache': true } });
        break;
    }
    if (install && eco.id !== 'ruby') steps.push({ name: `Install ${eco.label} dependencies`, run: install });
  }
  return steps;
}

function setupWorkflow(ctx: Context): string {
  const workflow = {
    name: 'Copilot Setup Steps',
    on: {
      workflow_dispatch: null,
      push: { paths: ['.github/workflows/copilot-setup-steps.yml'] },
      pull_request: { paths: ['.github/workflows/copilot-setup-steps.yml'] },
    },
    jobs: {
      'copilot-setup-steps': {
        'runs-on': 'ubuntu-latest',
        permissions: { contents: 'read' },
        steps: setupSteps(ctx),
      },
    },
  };
  const yaml = stringify(workflow, { lineWidth: 0 }).replace('workflow_dispatch: null', 'workflow_dispatch:');
  return `# ${GENERATED_MARKER} — prepares the environment for the GitHub Copilot coding agent.
# Regenerate with \`npx repo-onboard sync\`; remove this comment line to take ownership of the file.
${yaml}`;
}

export const copilot: Target = {
  id: 'copilot',
  label: 'GitHub Copilot',
  description: 'copilot-instructions.md, path instructions, coding-agent setup steps, .vscode/mcp.json',
  docs: 'https://docs.github.com/en/copilot/reference/custom-instructions-support',
  verified: '2026-11',

  detect: (profile) =>
    profile.existing.some(
      (f) => f.startsWith('.github/copilot') || f === '.github/instructions' || f === '.github/agents',
    ),

  async plan(ctx) {
    const ops: FileOp[] = [
      {
        kind: 'managed',
        path: '.github/copilot-instructions.md',
        owner: 'copilot',
        initial: instructions(ctx),
        adopt: 'prepend',
      },
    ];
    const tests = testInstructions(ctx);
    if (tests)
      ops.push({
        kind: 'generated',
        path: '.github/instructions/tests.instructions.md',
        owner: 'copilot',
        content: tests,
      });
    if (ctx.profile.ecosystems.length)
      ops.push({
        kind: 'generated',
        path: '.github/workflows/copilot-setup-steps.yml',
        owner: 'copilot',
        content: setupWorkflow(ctx),
      });
    if (Object.keys(ctx.config.mcpServers).length)
      ops.push({
        kind: 'data',
        path: '.vscode/mcp.json',
        owner: 'copilot',
        format: 'json',
        edits: mcpEdits(ctx.config.mcpServers, ['servers'], vscodeMcp),
      });
    return ops;
  },

  async contextMap(ctx) {
    const at = (p: string) => exists(path.join(ctx.root, p));
    const instructionFiles = (await listDir(path.join(ctx.root, '.github', 'instructions'))).filter((f) =>
      f.endsWith('.instructions.md'),
    );
    const agents = await listDir(path.join(ctx.root, '.github', 'agents'));
    return [
      {
        path: '.github/copilot-instructions.md',
        role: 'repository-wide instructions',
        present: await at('.github/copilot-instructions.md'),
      },
      {
        path: '.github/instructions/*.instructions.md',
        role: `path-specific instructions (${instructionFiles.length})`,
        present: instructionFiles.length > 0,
      },
      {
        path: 'AGENTS.md',
        role: 'agent instructions (coding agent, VS Code, CLI, code review)',
        present: await at('AGENTS.md'),
      },
      { path: '.github/agents/', role: `custom agents (${agents.length})`, present: agents.length > 0 },
      {
        path: '.github/workflows/copilot-setup-steps.yml',
        role: 'coding agent environment setup',
        present: await at('.github/workflows/copilot-setup-steps.yml'),
      },
      { path: '.vscode/mcp.json', role: 'MCP servers (VS Code)', present: await at('.vscode/mcp.json') },
    ];
  },
};
