import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, vi } from 'vitest';
import { main } from '../src/cli.js';

const created: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  while (created.length) await rm(created.pop()!, { recursive: true, force: true });
});

/** Creates a throwaway repository with the given files (posix paths → contents). */
export async function makeRepo(files: Record<string, string | object>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'repo-onboard-'));
  created.push(dir);
  for (const [file, content] of Object.entries(files)) await write(dir, file, content);
  return dir;
}

export async function write(dir: string, file: string, content: string | object): Promise<void> {
  const full = path.join(dir, ...file.split('/'));
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
}

export async function read(dir: string, file: string): Promise<string> {
  return (await readFile(path.join(dir, ...file.split('/')), 'utf8')).replace(/\r\n/g, '\n');
}

export async function readMaybe(dir: string, file: string): Promise<string | undefined> {
  try {
    return await read(dir, file);
  } catch {
    return undefined;
  }
}

/** Runs the CLI in-process and captures output. */
export async function run(dir: string, ...args: string[]): Promise<{ code: number; output: string }> {
  const lines: string[] = [];
  const capture = (...parts: unknown[]) => {
    lines.push(parts.map(String).join(' '));
  };
  const log = vi.spyOn(console, 'log').mockImplementation(capture);
  const err = vi.spyOn(console, 'error').mockImplementation(capture);
  const stdout = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  try {
    const code = await main(['node', 'repo-onboard', '--cwd', dir, ...args]);
    return { code, output: lines.join('\n') };
  } finally {
    log.mockRestore();
    err.mockRestore();
    stdout.mockRestore();
    process.exitCode = 0;
  }
}

export const NODE_APP = {
  'package.json': {
    name: 'acme-web',
    description: 'Acme storefront web app.',
    license: 'MIT',
    packageManager: 'pnpm@9.12.0',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      test: 'vitest run',
      lint: 'biome check .',
      typecheck: 'tsc --noEmit',
    },
    devDependencies: { vitest: '^3.0.0', '@biomejs/biome': '^2.0.0', typescript: '^5.0.0', vite: '^6.0.0' },
    dependencies: { react: '^19.0.0' },
  },
  'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
  '.nvmrc': '22\n',
  'tsconfig.json': '{}\n',
  'src/index.ts': 'export const x = 1;\n',
  'tests/app.test.ts': "import { test } from 'vitest';\ntest('x', () => {});\n",
};
