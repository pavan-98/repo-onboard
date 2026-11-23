import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { exists, firstExisting, isDir, listDir, readJson, readText } from '../core/fs.js';
import type { Command, CommandKind, Ecosystem, WorkspacePackage } from '../core/types.js';

interface PackageJson {
  name?: string;
  description?: string;
  license?: string;
  scripts?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  packageManager?: string;
  engines?: { node?: string };
  volta?: { node?: string };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export type NodePm = 'npm' | 'pnpm' | 'yarn' | 'bun';

const NPM_DEFAULT_TEST = 'echo "Error: no test specified" && exit 1';

const SCRIPT_PRIORITY: Record<Exclude<CommandKind, 'install'>, string[]> = {
  dev: ['dev', 'start:dev', 'develop', 'serve', 'start', 'watch'],
  build: ['build', 'compile'],
  test: ['test', 'test:unit', 'tests', 'spec'],
  lint: ['lint', 'lint:check', 'check:lint', 'lint:all'],
  format: ['format', 'fmt', 'format:fix', 'format:write', 'prettier', 'format:check'],
  typecheck: ['typecheck', 'type-check', 'check-types', 'types', 'tsc', 'typecheck:all'],
};

const TOOLS: Record<string, string> = {
  vitest: 'Vitest',
  jest: 'Jest',
  mocha: 'Mocha',
  ava: 'AVA',
  '@playwright/test': 'Playwright',
  cypress: 'Cypress',
  eslint: 'ESLint',
  '@biomejs/biome': 'Biome',
  oxlint: 'Oxlint',
  prettier: 'Prettier',
  husky: 'Husky',
  'lint-staged': 'lint-staged',
  '@changesets/cli': 'Changesets',
  'semantic-release': 'semantic-release',
  storybook: 'Storybook',
  prisma: 'Prisma',
  'drizzle-kit': 'Drizzle',
};

const FRAMEWORKS: Record<string, string> = {
  next: 'Next.js',
  nuxt: 'Nuxt',
  '@remix-run/react': 'Remix',
  'react-router': 'React Router',
  astro: 'Astro',
  '@sveltejs/kit': 'SvelteKit',
  svelte: 'Svelte',
  vue: 'Vue',
  '@angular/core': 'Angular',
  'solid-js': 'SolidJS',
  react: 'React',
  'react-native': 'React Native',
  expo: 'Expo',
  electron: 'Electron',
  vite: 'Vite',
  express: 'Express',
  fastify: 'Fastify',
  '@nestjs/core': 'NestJS',
  hono: 'Hono',
  koa: 'Koa',
};

export function runScript(pm: NodePm, script: string): string {
  if (pm === 'npm') return script === 'test' || script === 'start' ? `npm ${script}` : `npm run ${script}`;
  if (pm === 'pnpm') return script === 'test' ? 'pnpm test' : `pnpm run ${script}`;
  if (pm === 'yarn') return `yarn run ${script}`;
  return `bun run ${script}`;
}

function execPrefix(pm: NodePm): string {
  return { npm: 'npx', pnpm: 'pnpm exec', yarn: 'yarn', bun: 'bunx' }[pm];
}

function workspaceScript(pm: NodePm, pkg: { name: string; dir: string }, script: string): string {
  switch (pm) {
    case 'pnpm':
      return `pnpm --filter ${pkg.name} run ${script}`;
    case 'yarn':
      return `yarn workspace ${pkg.name} run ${script}`;
    case 'bun':
      return `bun run --filter ${pkg.name} ${script}`;
    default:
      return `npm run ${script} --workspace ${pkg.dir}`;
  }
}

async function detectPm(root: string, pkg: PackageJson): Promise<{ pm: NodePm; lockfile?: string }> {
  const declared = pkg.packageManager?.split('@')[0];
  const lockfile = await firstExisting(root, [
    'pnpm-lock.yaml',
    'yarn.lock',
    'bun.lock',
    'bun.lockb',
    'package-lock.json',
    'npm-shrinkwrap.json',
  ]);
  if (declared === 'pnpm' || declared === 'yarn' || declared === 'bun' || declared === 'npm')
    return { pm: declared, lockfile };
  if (lockfile?.startsWith('pnpm')) return { pm: 'pnpm', lockfile };
  if (lockfile?.startsWith('yarn')) return { pm: 'yarn', lockfile };
  if (lockfile?.startsWith('bun')) return { pm: 'bun', lockfile };
  return { pm: 'npm', lockfile };
}

async function installCommand(root: string, pm: NodePm, lockfile: string | undefined): Promise<string> {
  if (pm === 'npm') return lockfile ? 'npm ci' : 'npm install';
  if (pm === 'pnpm') return lockfile ? 'pnpm install --frozen-lockfile' : 'pnpm install';
  if (pm === 'bun') return lockfile ? 'bun install --frozen-lockfile' : 'bun install';
  if (!lockfile) return 'yarn install';
  return (await exists(path.join(root, '.yarnrc.yml')))
    ? 'yarn install --immutable'
    : 'yarn install --frozen-lockfile';
}

function pickScripts(
  scripts: Record<string, string>,
  render: (script: string) => string,
  source: string,
): Command[] {
  const commands: Command[] = [];
  for (const [kind, names] of Object.entries(SCRIPT_PRIORITY) as [CommandKind, string[]][]) {
    const name = names.find((n) => scripts[n] !== undefined && scripts[n]!.trim() !== NPM_DEFAULT_TEST);
    if (name) commands.push({ kind, run: render(name), source: `${source}#scripts.${name}` });
  }
  return commands;
}

async function expandWorkspaceGlobs(root: string, patterns: string[]): Promise<string[]> {
  const dirs = new Set<string>();
  for (const raw of patterns) {
    if (raw.startsWith('!')) continue;
    const pattern = raw.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/$/, '');
    const starAt = pattern.indexOf('*');
    if (starAt === -1) {
      if (await exists(path.join(root, pattern, 'package.json'))) dirs.add(pattern);
      continue;
    }
    const base = pattern.slice(0, starAt).replace(/\/$/, '');
    for (const entry of await listDir(path.join(root, base))) {
      const dir = base ? `${base}/${entry}` : entry;
      if (entry.startsWith('.') || entry === 'node_modules') continue;
      if ((await isDir(path.join(root, dir))) && (await exists(path.join(root, dir, 'package.json'))))
        dirs.add(dir);
    }
  }
  return [...dirs].sort();
}

async function nodeVersion(
  root: string,
  pkg: PackageJson,
): Promise<{ version?: string; versionFile?: string }> {
  for (const file of ['.nvmrc', '.node-version']) {
    const text = (await readText(path.join(root, file)))?.trim();
    if (text) return { version: text.replace(/^v/, ''), versionFile: file };
  }
  if (pkg.volta?.node) return { version: pkg.volta.node, versionFile: 'package.json' };
  if (pkg.engines?.node) return { version: pkg.engines.node, versionFile: 'package.json' };
  return {};
}

export interface NodeDetection {
  ecosystem: Ecosystem;
  workspaces: WorkspacePackage[];
  monorepoTool?: string;
  name?: string;
  description?: string;
  license?: string;
  scripts: Record<string, string>;
}

export async function detectNode(root: string): Promise<NodeDetection | undefined> {
  const pkg = await readJson<PackageJson>(path.join(root, 'package.json'));
  if (!pkg) return undefined;

  const { pm, lockfile } = await detectPm(root, pkg);
  const deps = { ...pkg.peerDependencies, ...pkg.dependencies, ...pkg.devDependencies };
  const has = (name: string) => deps[name] !== undefined;
  const scripts = pkg.scripts ?? {};
  const isTs = has('typescript') || (await exists(path.join(root, 'tsconfig.json')));

  const tools = Object.entries(TOOLS)
    .filter(([dep]) => has(dep))
    .map(([, label]) => label);
  if (isTs) tools.unshift('TypeScript');
  const frameworks = Object.entries(FRAMEWORKS)
    .filter(([dep]) => has(dep))
    .map(([, label]) => label);

  const commands: Command[] = [
    { kind: 'install', run: await installCommand(root, pm, lockfile), source: lockfile ?? 'package.json' },
    ...pickScripts(scripts, (s) => runScript(pm, s), 'package.json'),
  ];

  // Infer commands from tool config only when no script covers them.
  const x = execPrefix(pm);
  const hasKind = (kind: CommandKind) => commands.some((c) => c.kind === kind);
  if (!hasKind('test')) {
    if (has('vitest')) commands.push({ kind: 'test', run: `${x} vitest run`, source: 'inferred' });
    else if (has('jest')) commands.push({ kind: 'test', run: `${x} jest`, source: 'inferred' });
  }
  if (!hasKind('lint')) {
    if (has('@biomejs/biome')) commands.push({ kind: 'lint', run: `${x} biome check .`, source: 'inferred' });
    else if (has('eslint')) commands.push({ kind: 'lint', run: `${x} eslint .`, source: 'inferred' });
  }
  if (!hasKind('typecheck') && isTs && (await exists(path.join(root, 'tsconfig.json'))))
    commands.push({ kind: 'typecheck', run: `${x} tsc --noEmit`, source: 'inferred' });

  let singleTest: string | undefined;
  if (has('vitest')) singleTest = `${x} vitest run <path/to/file.test.ts> -t "<test name>"`;
  else if (has('jest')) singleTest = `${x} jest <path/to/file.test.ts> -t "<test name>"`;
  else if (has('mocha')) singleTest = `${x} mocha <path/to/file.test.js> --grep "<test name>"`;
  else if (/node --test|node:test/.test(scripts.test ?? ''))
    singleTest = 'node --test --test-name-pattern="<test name>" <path/to/file.test.js>';

  const testGlobs =
    has('vitest') || has('jest') || has('mocha') || scripts.test
      ? [isTs ? '**/*.{test,spec}.{ts,tsx,mts,cts}' : '**/*.{test,spec}.{js,jsx,mjs,cjs}', '**/__tests__/**']
      : [];
  if (has('@playwright/test') || has('cypress')) testGlobs.push('e2e/**', 'tests/e2e/**');

  // Workspaces
  let patterns: string[] = [];
  if (Array.isArray(pkg.workspaces)) patterns = pkg.workspaces;
  else if (pkg.workspaces?.packages) patterns = pkg.workspaces.packages;
  const pnpmWorkspace = await readText(path.join(root, 'pnpm-workspace.yaml'));
  if (pnpmWorkspace) {
    try {
      const parsed = parseYaml(pnpmWorkspace) as { packages?: string[] } | null;
      patterns = [...patterns, ...(parsed?.packages ?? [])];
    } catch {
      // ignore malformed workspace file
    }
  }

  const workspaces: WorkspacePackage[] = [];
  for (const dir of await expandWorkspaceGlobs(root, patterns)) {
    const child = await readJson<PackageJson>(path.join(root, dir, 'package.json'));
    if (!child) continue;
    const name = child.name ?? dir;
    workspaces.push({
      name,
      dir,
      ...(child.description ? { description: child.description } : {}),
      commands: pickScripts(
        child.scripts ?? {},
        (s) => workspaceScript(pm, { name, dir }, s),
        `${dir}/package.json`,
      ),
    });
  }

  let monorepoTool: string | undefined;
  if (await exists(path.join(root, 'turbo.json'))) monorepoTool = 'Turborepo';
  else if (await exists(path.join(root, 'nx.json'))) monorepoTool = 'Nx';
  else if (await exists(path.join(root, 'lerna.json'))) monorepoTool = 'Lerna';
  else if (workspaces.length > 0) monorepoTool = `${pm} workspaces`;

  const { version, versionFile } = await nodeVersion(root, pkg);

  return {
    ecosystem: {
      id: 'node',
      label: 'Node.js',
      language: isTs ? 'TypeScript' : 'JavaScript',
      ...(version ? { version } : {}),
      ...(versionFile ? { versionFile } : {}),
      packageManager: pm,
      manifest: 'package.json',
      tools,
      frameworks,
      commands,
      ...(singleTest ? { singleTest } : {}),
      testGlobs,
    },
    workspaces,
    ...(monorepoTool ? { monorepoTool } : {}),
    ...(pkg.name ? { name: pkg.name } : {}),
    ...(pkg.description ? { description: pkg.description } : {}),
    ...(pkg.license ? { license: pkg.license } : {}),
    scripts,
  };
}
