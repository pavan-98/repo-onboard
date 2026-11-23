import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml } from 'yaml';
import { exists, firstExisting, isDir, listDir, readText } from '../core/fs.js';
import type {
  CiInfo,
  Command,
  CommandKind,
  Ecosystem,
  RepoProfile,
  TaskRunner,
  TopLevelEntry,
} from '../core/types.js';
import { COMMAND_KINDS } from '../core/types.js';
import { detectNode } from './node.js';
import { detectDotnet, detectGo, detectJvm, detectRuby, detectRust } from './others.js';
import { detectPython } from './python.js';

const run = promisify(execFile);

/** Folders never shown in the repository map. */
const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'out',
  'coverage',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'vendor',
]);

/** Agent configuration folders: real, but noise in a repo map. */
const AGENT_DIRS = new Set([
  '.agents',
  '.claude',
  '.gemini',
  '.codex',
  '.cursor',
  '.windsurf',
  '.clinerules',
  '.junie',
  '.kiro',
  '.ai',
  '.vscode',
  '.idea',
]);

const DIR_DESCRIPTIONS: Record<string, string> = {
  src: 'Source code',
  lib: 'Library source code',
  app: 'Application source code',
  apps: 'Deployable applications (workspace packages)',
  packages: 'Shared packages (workspace packages)',
  libs: 'Shared libraries',
  crates: 'Rust workspace crates',
  cmd: 'Go entry points (one folder per binary)',
  internal: 'Private Go packages',
  pkg: 'Public Go packages',
  test: 'Tests',
  tests: 'Tests',
  spec: 'Tests (specs)',
  __tests__: 'Tests',
  e2e: 'End-to-end tests',
  docs: 'Documentation',
  doc: 'Documentation',
  scripts: 'Development and maintenance scripts',
  bin: 'Executable entry points',
  tools: 'Internal tooling',
  config: 'Configuration',
  migrations: 'Database migrations',
  prisma: 'Prisma schema and migrations',
  db: 'Database schema and migrations',
  public: 'Static assets served as-is',
  static: 'Static assets',
  assets: 'Static assets',
  examples: 'Usage examples',
  benchmarks: 'Benchmarks',
  bench: 'Benchmarks',
  infra: 'Infrastructure as code',
  deploy: 'Deployment configuration',
  terraform: 'Terraform infrastructure',
  k8s: 'Kubernetes manifests',
  helm: 'Helm charts',
  charts: 'Helm charts',
  schema: 'Schemas',
  schemas: 'Schemas',
  templates: 'Templates',
  fixtures: 'Test fixtures',
  api: 'API definitions or handlers',
  web: 'Web front end',
  frontend: 'Front end',
  client: 'Client application',
  server: 'Server application',
  backend: 'Back end',
  mobile: 'Mobile application',
  android: 'Android application',
  ios: 'iOS application',
  '.github': 'GitHub workflows, templates and Copilot config',
  '.devcontainer': 'Dev container definition',
  '.husky': 'Git hooks',
  '.changeset': 'Pending release notes (Changesets)',
};

/** Agent / AI files repo-onboard knows about. */
export const KNOWN_AGENT_FILES = [
  'AGENTS.md',
  'AGENTS.override.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'GEMINI.md',
  '.github/copilot-instructions.md',
  '.github/instructions',
  '.github/agents',
  '.github/prompts',
  '.github/workflows/copilot-setup-steps.yml',
  '.agents/skills',
  '.claude',
  '.mcp.json',
  '.gemini',
  '.codex',
  '.cursor',
  '.cursorrules',
  '.windsurf',
  '.windsurfrules',
  '.clinerules',
  '.junie',
  '.kiro',
  '.aider.conf.yml',
  'CONVENTIONS.md',
  '.vscode/mcp.json',
  '.ai',
];

async function gitTopLevel(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await run('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
      cwd: root,
      maxBuffer: 256 * 1024 * 1024,
    });
    const dirs = new Set<string>();
    for (const file of stdout.split('\0')) {
      const slash = file.indexOf('/');
      if (slash > 0) dirs.add(file.slice(0, slash));
    }
    return [...dirs];
  } catch {
    return undefined;
  }
}

/** Filters and describes top-level folders for the repository map. */
export function describeTopLevel(dirs: string[], ignore: string[], workspaceDirs: string[]): TopLevelEntry[] {
  const ignored = new Set(ignore.map((i) => i.replace(/\/$/, '')));
  return [...new Set(dirs)]
    .filter((d) => !SKIP_DIRS.has(d) && !AGENT_DIRS.has(d) && !ignored.has(d))
    .filter((d) => !d.startsWith('.') || DIR_DESCRIPTIONS[d] !== undefined)
    .sort((a, b) => a.localeCompare(b))
    .map((d) => {
      const description =
        DIR_DESCRIPTIONS[d] ??
        (workspaceDirs.some((w) => w.startsWith(`${d}/`)) ? 'Workspace packages' : undefined);
      return description ? { path: d, description } : { path: d };
    });
}

async function detectTopLevel(
  root: string,
  ignore: string[],
  workspaceDirs: string[],
): Promise<TopLevelEntry[]> {
  let dirs = await gitTopLevel(root);
  if (!dirs) {
    dirs = [];
    for (const entry of await listDir(root)) {
      if (await isDir(path.join(root, entry))) dirs.push(entry);
    }
  }
  return describeTopLevel(dirs, ignore, workspaceDirs);
}

async function detectTaskRunner(root: string): Promise<TaskRunner | undefined> {
  const makefile = await firstExisting(root, ['Makefile', 'GNUmakefile', 'makefile']);
  if (makefile) {
    const text = (await readText(path.join(root, makefile))) ?? '';
    const targets = new Set<string>();
    for (const match of text.matchAll(/^([A-Za-z0-9][\w.-]*)\s*:(?![=:])/gm)) targets.add(match[1]!);
    return { tool: 'make', file: makefile, targets: [...targets] };
  }
  const justfile = await firstExisting(root, ['justfile', 'Justfile', '.justfile']);
  if (justfile) {
    const text = (await readText(path.join(root, justfile))) ?? '';
    const targets = new Set<string>();
    for (const match of text.matchAll(/^@?([A-Za-z_][\w-]*)(?:\s+[^:=\n]*)?:(?!=)/gm)) {
      if (!['set', 'alias', 'export', 'import', 'mod'].includes(match[1]!)) targets.add(match[1]!);
    }
    return { tool: 'just', file: justfile, targets: [...targets] };
  }
  const taskfile = await firstExisting(root, ['Taskfile.yml', 'Taskfile.yaml', 'taskfile.yml']);
  if (taskfile) {
    try {
      const parsed = parseYaml((await readText(path.join(root, taskfile))) ?? '') as {
        tasks?: Record<string, unknown>;
      };
      return { tool: 'task', file: taskfile, targets: Object.keys(parsed?.tasks ?? {}) };
    } catch {
      return { tool: 'task', file: taskfile, targets: [] };
    }
  }
  return undefined;
}

const RUNNER_ALIASES: Record<CommandKind, string[]> = {
  install: ['install', 'setup', 'bootstrap', 'deps'],
  dev: ['dev', 'run', 'serve', 'start'],
  build: ['build'],
  test: ['test', 'tests'],
  lint: ['lint', 'check'],
  format: ['format', 'fmt'],
  typecheck: ['typecheck', 'type-check', 'types'],
};

function mergeCommands(ecosystems: Ecosystem[], runner: TaskRunner | undefined): Command[] {
  const commands: Command[] = [];
  const multi = ecosystems.length > 1;
  for (const kind of COMMAND_KINDS) {
    const alias = runner?.targets.find((t) => RUNNER_ALIASES[kind].includes(t));
    if (runner && alias) {
      commands.push({ kind, run: `${runner.tool} ${alias}`, source: runner.file });
      continue;
    }
    for (const eco of ecosystems) {
      const cmd = eco.commands.find((c) => c.kind === kind);
      if (cmd) commands.push(multi ? { ...cmd, scope: eco.language } : cmd);
    }
  }
  return commands;
}

async function detectCi(root: string): Promise<CiInfo[]> {
  const ci: CiInfo[] = [];
  const workflowDir = path.join(root, '.github', 'workflows');
  for (const file of await listDir(workflowDir)) {
    if (!/\.ya?ml$/.test(file) || file === 'copilot-setup-steps.yml') continue;
    const runSteps: string[] = [];
    try {
      const wf = parseYaml((await readText(path.join(workflowDir, file))) ?? '') as {
        jobs?: Record<string, { steps?: { run?: string }[] }>;
      };
      for (const job of Object.values(wf?.jobs ?? {})) {
        for (const step of job?.steps ?? []) {
          const line = step?.run?.trim().split('\n')[0]?.trim();
          if (line && !runSteps.includes(line)) runSteps.push(line);
        }
      }
    } catch {
      // ignore malformed workflow
    }
    ci.push({
      provider: 'GitHub Actions',
      file: `.github/workflows/${file}`,
      runSteps: runSteps.slice(0, 12),
    });
  }
  const others: [string, string][] = [
    ['.gitlab-ci.yml', 'GitLab CI'],
    ['.circleci/config.yml', 'CircleCI'],
    ['azure-pipelines.yml', 'Azure Pipelines'],
    ['bitbucket-pipelines.yml', 'Bitbucket Pipelines'],
    ['Jenkinsfile', 'Jenkins'],
    ['.buildkite/pipeline.yml', 'Buildkite'],
  ];
  for (const [file, provider] of others) {
    if (await exists(path.join(root, file))) ci.push({ provider, file, runSteps: [] });
  }
  return ci;
}

async function readmeDescription(root: string): Promise<string | undefined> {
  const readme = await firstExisting(root, ['README.md', 'readme.md', 'Readme.md']);
  if (!readme) return undefined;
  const text = (await readText(path.join(root, readme))) ?? '';
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^>\s*/, '');
    if (
      !line ||
      line.startsWith('#') ||
      line.startsWith('<') ||
      line.startsWith('[![') ||
      line.startsWith('![')
    )
      continue;
    if (line.startsWith('```') || line.startsWith('|') || line.startsWith('-') || line.startsWith('*')) break;
    return line.length > 300 ? `${line.slice(0, 297)}...` : line;
  }
  return undefined;
}

async function detectLicense(root: string, declared?: string): Promise<string | undefined> {
  if (declared) return declared;
  const file = await firstExisting(root, ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING']);
  if (!file) return undefined;
  const text = (await readText(path.join(root, file))) ?? '';
  if (/MIT License/i.test(text)) return 'MIT';
  if (/Apache License[\s\S]*Version 2\.0/i.test(text)) return 'Apache-2.0';
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]*Version 3/i.test(text)) return 'GPL-3.0';
  if (/Mozilla Public License[\s\S]*2\.0/i.test(text)) return 'MPL-2.0';
  if (/BSD 3-Clause|Redistribution and use in source and binary forms/i.test(text)) return 'BSD';
  return `see ${file}`;
}

export interface DetectOptions {
  ignore?: string[];
  name?: string;
}

export async function detect(root: string, options: DetectOptions = {}): Promise<RepoProfile> {
  const node = await detectNode(root);
  const python = await detectPython(root);
  const simple = [
    await detectGo(root),
    await detectRust(root),
    await detectJvm(root),
    await detectDotnet(root),
    await detectRuby(root),
  ].filter((d) => d !== undefined);

  const ecosystems: Ecosystem[] = [];
  if (node) ecosystems.push(node.ecosystem);
  if (python) ecosystems.push(python.ecosystem);
  ecosystems.push(...simple.map((d) => d.ecosystem));

  const taskRunner = await detectTaskRunner(root);
  const workspaces = node?.workspaces ?? [];

  const conventionalCommits =
    !!(await firstExisting(root, [
      'commitlint.config.js',
      'commitlint.config.cjs',
      'commitlint.config.mjs',
      'commitlint.config.ts',
      '.commitlintrc',
      '.commitlintrc.json',
      '.commitlintrc.yml',
      '.commitlintrc.yaml',
      '.czrc',
      '.cz.toml',
      'release-please-config.json',
      '.releaserc',
      '.releaserc.json',
      'release.config.js',
    ])) || /"commitlint"|"semantic-release"/.test((await readText(path.join(root, 'package.json'))) ?? '');

  const compose = await firstExisting(root, [
    'compose.yaml',
    'compose.yml',
    'docker-compose.yml',
    'docker-compose.yaml',
  ]);

  const existing: string[] = [];
  for (const file of KNOWN_AGENT_FILES) {
    if (await exists(path.join(root, file))) existing.push(file);
  }

  const first = [node, python, ...simple].find((d) => d?.name);
  const name = options.name ?? first?.name ?? path.basename(path.resolve(root));
  const description =
    [node, python, ...simple].find((d) => d?.description)?.description ?? (await readmeDescription(root));

  const envExample = await firstExisting(root, ['.env.example', '.env.sample', '.env.template', '.env.dist']);
  const license = await detectLicense(root, node?.license);

  return {
    root,
    name,
    ...(description ? { description } : {}),
    ecosystems,
    commands: mergeCommands(ecosystems, taskRunner),
    workspaces,
    ...(node?.monorepoTool ? { monorepoTool: node.monorepoTool } : {}),
    ...(taskRunner ? { taskRunner } : {}),
    ci: await detectCi(root),
    containers: {
      dockerfile: await exists(path.join(root, 'Dockerfile')),
      ...(compose ? { compose } : {}),
      devcontainer:
        (await exists(path.join(root, '.devcontainer'))) ||
        (await exists(path.join(root, '.devcontainer.json'))),
    },
    ...(envExample ? { envExample } : {}),
    conventionalCommits,
    ...(license ? { license } : {}),
    topLevel: await detectTopLevel(
      root,
      options.ignore ?? [],
      workspaces.map((w) => w.dir),
    ),
    existing,
  };
}
