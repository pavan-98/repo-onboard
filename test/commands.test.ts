import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { V1 } from '../src/templates/v1.js';
import { makeRepo, NODE_APP, read, readMaybe, run, write } from './helpers.js';

async function initRepo(files: Record<string, string | object> = NODE_APP, ...args: string[]) {
  const dir = await makeRepo(files);
  const result = await run(dir, 'init', '--yes', ...args);
  expect(result.code, result.output).toBe(0);
  return dir;
}

describe('init', () => {
  it('generates AGENTS.md, adapters, skills and docs from the real repo', async () => {
    const dir = await initRepo();
    const agents = await read(dir, 'AGENTS.md');
    expect(agents).toContain('| Test | `pnpm test` |');
    expect(agents).toContain('`pnpm exec vitest run <path/to/file.test.ts> -t "<test name>"`');
    expect(agents).toContain('**TypeScript on Node.js** 22 (from `.nvmrc`)');

    expect(await read(dir, 'CLAUDE.md')).toMatch(/^<!-- repo-onboard:begin import -->\n@AGENTS\.md\n/);
    const claudeSettings = JSON.parse(await read(dir, '.claude/settings.json'));
    expect(claudeSettings.permissions.allow).toContain('Bash(pnpm test:*)');
    expect(JSON.parse(await read(dir, '.gemini/settings.json')).context.fileName).toEqual([
      'AGENTS.md',
      'GEMINI.md',
    ]);
    expect(await read(dir, '.github/copilot-instructions.md')).toContain('[AGENTS.md](../AGENTS.md)');
    const setup = await read(dir, '.github/workflows/copilot-setup-steps.yml');
    expect(setup).toContain('copilot-setup-steps:');
    expect(setup).toContain('pnpm/action-setup');
    expect(setup).toContain('node-version-file: .nvmrc');
    expect(setup).toContain('run: pnpm install --frozen-lockfile');
    expect(await read(dir, '.github/instructions/tests.instructions.md')).toMatch(
      /^---\napplyTo: "\*\*\/\*\.\{test,spec\}/,
    );

    for (const skill of ['repo-onboard', 'run-checks', 'add-adr']) {
      expect(await read(dir, `.agents/skills/${skill}/SKILL.md`)).toMatch(
        new RegExp(`^---\\nname: ${skill}\\n`),
      );
      expect(await read(dir, `.claude/skills/${skill}/SKILL.md`)).toContain(
        `.agents/skills/${skill}/SKILL.md`,
      );
    }
    for (const doc of [
      'CONTRIBUTING.md',
      'docs/ONBOARDING.md',
      'docs/ARCHITECTURE.md',
      'docs/adr/README.md',
      'SECURITY.md',
      'README.md',
    ]) {
      expect(await readMaybe(dir, doc), doc).toBeDefined();
    }
    const config = JSON.parse(await read(dir, 'repo-onboard.config.json'));
    expect(config.targets).toEqual(['claude', 'codex', 'copilot', 'gemini']);
    expect(config.$schema).toMatch(/repo-onboard\.schema\.json$/);
  });

  it('is idempotent: sync --check passes and sync changes nothing', async () => {
    const dir = await initRepo();
    const before = await read(dir, 'AGENTS.md');
    expect((await run(dir, 'sync', '--check')).code).toBe(0);
    const sync = await run(dir, 'sync');
    expect(sync.output).toContain('already in sync');
    expect(await read(dir, 'AGENTS.md')).toBe(before);
  });

  it('matches the AGENTS.md snapshot', async () => {
    const dir = await initRepo();
    expect(await read(dir, 'AGENTS.md')).toMatchSnapshot();
  });

  it('respects --targets, --docs-dir, --no-docs and --dry-run', async () => {
    const dry = await makeRepo(NODE_APP);
    const result = await run(dry, 'init', '--yes', '--dry-run');
    expect(result.output).toContain('+ create    AGENTS.md');
    expect(await readMaybe(dry, 'AGENTS.md')).toBeUndefined();

    const dir = await initRepo(NODE_APP, '--targets', 'claude,cursor,aider', '--docs-dir', 'handbook');
    expect(await readMaybe(dir, '.gemini/settings.json')).toBeUndefined();
    expect(await read(dir, '.aider.conf.yml')).toContain('- AGENTS.md');
    expect(await read(dir, 'handbook/ONBOARDING.md')).toContain('# Onboarding');
    expect(await read(dir, 'AGENTS.md')).toContain('(handbook/ONBOARDING.md)');

    const noDocs = await initRepo(NODE_APP, '--no-docs', '--targets', 'all');
    expect(await readMaybe(noDocs, 'CONTRIBUTING.md')).toBeUndefined();
    expect(await readMaybe(noDocs, '.agents/skills/add-adr/SKILL.md')).toBeUndefined();
    expect(await read(noDocs, '.kiro/steering/agents.md')).toContain('#[[file:AGENTS.md]]');
    expect(await read(noDocs, '.windsurf/rules/agents.md')).toContain('../../AGENTS.md');
  });

  it('rejects unknown targets', async () => {
    const dir = await makeRepo(NODE_APP);
    const result = await run(dir, 'init', '--yes', '--targets', 'claude,chatgpt');
    expect(result.code).toBe(1);
    expect(result.output).toContain('Unknown target(s): chatgpt');
  });

  it('creates nested AGENTS.md and CLAUDE.md for workspace packages', async () => {
    const dir = await initRepo({
      'package.json': { name: 'mono', workspaces: ['packages/*'] },
      'pnpm-lock.yaml': '',
      'packages/ui/package.json': { name: '@acme/ui', scripts: { test: 'vitest' } },
    });
    const nested = await read(dir, 'packages/ui/AGENTS.md');
    expect(nested).toContain('[root AGENTS.md](../../AGENTS.md)');
    expect(nested).toContain('`pnpm --filter @acme/ui run test`');
    expect(await read(dir, 'packages/ui/CLAUDE.md')).toContain('@AGENTS.md');
  });
});

describe('ownership', () => {
  it('keeps human edits outside markers and restores generated sections', async () => {
    const dir = await initRepo();
    let agents = await read(dir, 'AGENTS.md');
    agents = agents.replace('## Code style', '## Code style\n\n- Use named exports only.');
    agents = agents.replace('| Test | `pnpm test` |', '| Test | `hand edited` |');
    await write(dir, 'AGENTS.md', agents);

    const check = await run(dir, 'check');
    expect(check.code).toBe(1);
    expect(check.output).toContain('[drift] AGENTS.md is out of date');

    await run(dir, 'sync');
    const synced = await read(dir, 'AGENTS.md');
    expect(synced).toContain('- Use named exports only.');
    expect(synced).toContain('| Test | `pnpm test` |');
  });

  it('adds the import to an existing CLAUDE.md without losing content', async () => {
    const dir = await initRepo({ ...NODE_APP, 'CLAUDE.md': '# Notes\n\nAlways use tabs.\n' });
    const claude = await read(dir, 'CLAUDE.md');
    expect(claude).toMatch(/^<!-- repo-onboard:begin import -->\n@AGENTS\.md/);
    expect(claude).toContain('Always use tabs.');
  });

  it('adopts an existing AGENTS.md by appending, or skips it with --no-adopt', async () => {
    const adopted = await initRepo({ ...NODE_APP, 'AGENTS.md': '# Our rules\n\nBe nice.\n' });
    const text = await read(adopted, 'AGENTS.md');
    expect(text.startsWith('# Our rules\n\nBe nice.')).toBe(true);
    expect(text).toContain('<!-- repo-onboard:begin commands -->');

    const skipped = await initRepo({ ...NODE_APP, 'AGENTS.md': '# Our rules\n' }, '--no-adopt');
    expect(await read(skipped, 'AGENTS.md')).toBe('# Our rules\n');
    expect((await run(skipped, 'check')).output).toContain('[unmanaged] AGENTS.md');
  });

  it('merges into existing Gemini settings and preserves CRLF line endings', async () => {
    const dir = await initRepo({
      ...NODE_APP,
      '.gemini/settings.json': '{\r\n  // keep\r\n  "theme": "Dracula"\r\n}\r\n',
      'CONTRIBUTING.md': '# Contributing\r\n\r\nOur own guide.\r\n',
    });
    const raw = await import('node:fs/promises').then((fs) =>
      fs.readFile(path.join(dir, '.gemini/settings.json'), 'utf8'),
    );
    expect(raw).toContain('\r\n');
    expect(raw).toContain('// keep');
    expect(raw).toContain('"AGENTS.md"');
    expect(await read(dir, 'CONTRIBUTING.md')).toBe('# Contributing\n\nOur own guide.\n');
  });

  it('never overwrites a generated-file path that a human owns', async () => {
    const dir = await initRepo({ ...NODE_APP, '.github/workflows/copilot-setup-steps.yml': 'name: mine\n' });
    expect(await read(dir, '.github/workflows/copilot-setup-steps.yml')).toBe('name: mine\n');
  });
});

describe('check', () => {
  it('fails before init and points to init', async () => {
    const dir = await makeRepo(NODE_APP);
    const result = await run(dir, 'check');
    expect(result.code).toBe(1);
    expect(result.output).toContain('npx repo-onboard init');
  });

  it('audit is an alias of check', async () => {
    const dir = await initRepo();
    expect((await run(dir, 'audit')).code).toBe(0);
  });

  it('catches stale commands, broken links, secrets and bad skills', async () => {
    const dir = await initRepo();
    await write(
      dir,
      'AGENTS.md',
      `${await read(dir, 'AGENTS.md')}\n## Extra\n\nRun \`pnpm run e2e\` and see [guide](docs/missing.md).\nkey: AKIAABCDEFGHIJKLMNOP\n`,
    );
    await write(dir, '.agents/skills/Bad_Skill/SKILL.md', '---\nname: Bad_Skill\n---\nhi\n');
    const result = await run(dir, 'check', '--format', 'json');
    expect(result.code).toBe(1);
    const rules = JSON.parse(result.output).findings.map((f: { rule: string }) => f.rule);
    expect(rules).toEqual(
      expect.arrayContaining([
        'commands/missing-script',
        'links/broken',
        'secrets',
        'skills/name',
        'skills/description',
      ]),
    );
  });

  it('detects drift when package.json scripts change', async () => {
    const dir = await initRepo();
    const pkg = JSON.parse(await read(dir, 'package.json'));
    pkg.scripts.test = undefined;
    pkg.scripts['test:unit'] = 'vitest run';
    await write(dir, 'package.json', pkg);
    const result = await run(dir, 'check');
    expect(result.code).toBe(1);
    expect(result.output).toContain('commands/missing-script');
    expect((await run(dir, 'sync')).code).toBe(0);
    expect((await run(dir, 'check')).code).toBe(0);
    expect(await read(dir, 'AGENTS.md')).toContain('`pnpm run test:unit`');
  });

  it('warns about oversized AGENTS.md and fails over the Codex limit', async () => {
    const dir = await initRepo();
    await write(dir, 'AGENTS.md', `${await read(dir, 'AGENTS.md')}\n${'x'.repeat(40 * 1024)}\n`);
    const result = await run(dir, 'check', '--format', 'json');
    const finding = JSON.parse(result.output).findings.find(
      (f: { rule: string }) => f.rule === 'size/agents-md',
    );
    expect(finding).toMatchObject({ severity: 'error', target: 'codex' });
  });

  it('emits SARIF and GitHub annotations', async () => {
    const dir = await makeRepo(NODE_APP);
    const sarif = JSON.parse((await run(dir, 'check', '--format', 'sarif')).output);
    expect(sarif.version).toBe('2.1.0');
    expect(sarif.runs[0].results.length).toBeGreaterThan(0);
    const gh = await run(dir, 'check', '--format', 'github');
    expect(gh.output).toMatch(/^::error file=repo-onboard\.config\.json,title=repo-onboard config::/m);
  });

  it('--strict fails on warnings', async () => {
    const dir = await initRepo({ ...NODE_APP, '.cursorrules': 'old rules' }, '--targets', 'claude,cursor');
    expect((await run(dir, 'check')).code).toBe(0);
    expect((await run(dir, 'check', '--strict')).code).toBe(1);
  });
});

describe('doctor', () => {
  it('shows what each tool loads', async () => {
    const dir = await initRepo();
    const result = await run(dir, 'doctor');
    expect(result.output).toContain('What each tool loads');
    expect(result.output).toContain('imported by CLAUDE.md via @AGENTS.md');
    const json = JSON.parse((await run(dir, 'doctor', '--json')).output);
    expect(json.contextMap.gemini.files[0]).toMatchObject({ path: 'AGENTS.md', present: true });
  });
});

describe('migrate', () => {
  it('moves custom v1 notes into native files and replaces v1 placeholders', async () => {
    const dir = await makeRepo({
      ...NODE_APP,
      'CONTRIBUTING.md': V1.contributing,
      'docs/ONBOARDING.md': V1.onboarding,
      'docs/ARCHITECTURE.md': '# Architecture Guide\n\nOur real architecture.\n',
      '.ai/_base.md': `${V1.aiBase}- Money is stored in cents.\n`,
      '.ai/claude.md': `${V1.aiTool('Claude')}- Use the Explore subagent first.\n`,
      '.ai/gemini.md': V1.aiTool('Gemini'),
      '.ai/chatgpt.md': V1.aiTool('ChatGPT'),
      '.ai/copilot.md': V1.aiTool('GitHub Copilot'),
    });
    const result = await run(dir, 'migrate', '--yes');
    expect(result.code, result.output).toBe(0);
    expect(await read(dir, 'AGENTS.md')).toContain('- Money is stored in cents.');
    expect(await read(dir, 'CLAUDE.md')).toContain('- Use the Explore subagent first.');
    expect(await readMaybe(dir, '.ai/_base.md')).toBeUndefined();
    expect(await read(dir, 'CONTRIBUTING.md')).toContain('<!-- repo-onboard:begin checks -->');
    expect(await read(dir, 'docs/ARCHITECTURE.md')).toBe('# Architecture Guide\n\nOur real architecture.\n');
    expect((await run(dir, 'sync', '--check')).code).toBe(0);
  });
});

describe('add', () => {
  it('fans one MCP server out to every tool', async () => {
    const dir = await initRepo(NODE_APP, '--targets', 'claude,codex,copilot,gemini,cursor');
    const result = await run(
      dir,
      'add',
      'mcp',
      '--env',
      'TOKEN=${env:DOCS_TOKEN}',
      '--yes',
      'docs',
      '--',
      'npx',
      '-y',
      '@acme/docs-mcp',
    );
    expect(result.code, result.output).toBe(0);
    await run(dir, 'add', 'mcp', 'remote', 'https://mcp.example.com/mcp', '--yes');
    expect(JSON.parse(await read(dir, '.mcp.json')).mcpServers).toMatchObject({
      docs: { command: 'npx', args: ['-y', '@acme/docs-mcp'], env: { TOKEN: '${env:DOCS_TOKEN}' } },
      remote: { type: 'http', url: 'https://mcp.example.com/mcp' },
    });
    expect(JSON.parse(await read(dir, '.vscode/mcp.json')).servers.docs.type).toBe('stdio');
    expect(JSON.parse(await read(dir, '.gemini/settings.json')).mcpServers.remote.httpUrl).toBe(
      'https://mcp.example.com/mcp',
    );
    expect(JSON.parse(await read(dir, '.cursor/mcp.json')).mcpServers.remote.url).toBe(
      'https://mcp.example.com/mcp',
    );
    expect(await read(dir, '.codex/config.toml')).toContain('[mcp_servers.docs]');
    expect((await run(dir, 'check')).code).toBe(0);
  });

  it('adds numbered ADRs and updates the index', async () => {
    const dir = await initRepo();
    await run(dir, 'add', 'adr', 'Use', 'Postgres', '--yes');
    const files = await import('node:fs/promises').then((fs) => fs.readdir(path.join(dir, 'docs/adr')));
    expect(files).toContain('0002-use-postgres.md');
    expect(await read(dir, 'docs/adr/README.md')).toContain('[2. Use Postgres](0002-use-postgres.md)');
    expect((await run(dir, 'check')).code).toBe(0);
  });

  it('adds custom skills and new targets', async () => {
    const dir = await initRepo();
    await run(
      dir,
      'add',
      'skill',
      'deploy-preview',
      '--description',
      'Deploy a preview build. Use when asked to share a preview.',
      '--yes',
    );
    expect(await read(dir, '.agents/skills/deploy-preview/SKILL.md')).toContain('name: deploy-preview');
    expect(await read(dir, '.claude/skills/deploy-preview/SKILL.md')).toContain(
      '.agents/skills/deploy-preview/SKILL.md',
    );
    await run(dir, 'add', 'target', 'cline', 'junie', '--yes');
    expect(await read(dir, '.clinerules/agents.md')).toContain('AGENTS.md');
    expect(JSON.parse(await read(dir, 'repo-onboard.config.json')).targets).toContain('junie');
    expect((await run(dir, 'check')).code).toBe(0);
  });
});

describe('draft', () => {
  it('fills placeholders using a custom agent command', async () => {
    const dir = await initRepo();
    await write(
      dir,
      'fake-agent.mjs',
      `let input = '';
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const keys = [...input.matchAll(/^- "([^"]+#[\\w-]+)"/gm)].map((m) => m[1]);
  console.log('Here you go:\\n' + JSON.stringify(Object.fromEntries(keys.map((k) => [k, 'Drafted text for ' + k]))));
});
`,
    );
    const result = await run(
      dir,
      'draft',
      '--cmd',
      `node ${JSON.stringify(path.join(dir, 'fake-agent.mjs'))}`,
      '--yes',
    );
    expect(result.code, result.output).toBe(0);
    expect(await read(dir, 'AGENTS.md')).toContain('- Drafted text for AGENTS.md#code-style');
    expect(await read(dir, 'docs/ARCHITECTURE.md')).toContain(
      'Drafted text for docs/ARCHITECTURE.md#architecture',
    );
    expect(await read(dir, 'AGENTS.md')).not.toContain('TODO(repo-onboard:code-style)');
  });

  it('reports a missing agent binary clearly', async () => {
    const dir = await initRepo();
    const result = await run(dir, 'draft', '--cmd', 'definitely-not-a-real-binary-xyz', '--yes');
    expect(result.code).toBe(1);
    expect(result.output).toContain('Drafting failed');
  });
});

describe('cli', () => {
  it('prints the version and help', async () => {
    const dir = await makeRepo({});
    expect((await run(dir, '--version')).code).toBe(0);
    const help = await run(dir, '--help');
    expect(help.output).toContain('init');
    expect(help.output).toContain('doctor');
  });

  it('works in an empty folder', async () => {
    const dir = await initRepo({});
    expect(await read(dir, 'AGENTS.md')).toContain('No build, test or lint commands were detected');
    expect((await run(dir, 'sync', '--check')).code).toBe(0);
  });

  it('dates the first ADR', async () => {
    const dir = await initRepo();
    expect(await read(dir, 'docs/adr/0001-record-architecture-decisions.md')).toMatch(
      /- Date: \d{4}-\d{2}-\d{2}/,
    );
  });
});

describe('formatters', () => {
  it('does not report drift for formatting-only changes (e.g. Prettier table alignment)', async () => {
    const dir = await initRepo();
    const agents = await read(dir, 'AGENTS.md');
    const prettier = agents
      .replace('|---|---|', '| ------ | ------- |')
      .replace('| Test | `pnpm test` |', '| Test   | `pnpm test`   |');
    await write(dir, 'AGENTS.md', prettier);
    expect((await run(dir, 'sync', '--check')).code).toBe(0);
    await run(dir, 'sync');
    expect(await read(dir, 'AGENTS.md')).toBe(prettier);
  });
});
