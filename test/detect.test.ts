import { describe, expect, it } from 'vitest';
import { detect } from '../src/detect/index.js';
import { makeRepo, NODE_APP } from './helpers.js';

const kinds = (profile: Awaited<ReturnType<typeof detect>>) =>
  Object.fromEntries(profile.commands.map((c) => [`${c.kind}${c.scope ? `:${c.scope}` : ''}`, c.run]));

describe('detect', () => {
  it('reads a pnpm TypeScript app', async () => {
    const profile = await detect(await makeRepo(NODE_APP));
    expect(profile.name).toBe('acme-web');
    expect(profile.description).toBe('Acme storefront web app.');
    const node = profile.ecosystems[0]!;
    expect(node).toMatchObject({
      language: 'TypeScript',
      packageManager: 'pnpm',
      version: '22',
      versionFile: '.nvmrc',
    });
    expect(node.frameworks).toEqual(expect.arrayContaining(['React', 'Vite']));
    expect(node.tools).toEqual(expect.arrayContaining(['Vitest', 'Biome']));
    expect(kinds(profile)).toMatchObject({
      install: 'pnpm install --frozen-lockfile',
      test: 'pnpm test',
      lint: 'pnpm run lint',
      typecheck: 'pnpm run typecheck',
    });
    expect(profile.topLevel.map((t) => t.path)).toEqual(['src', 'tests']);
  });

  it('ignores the npm default test script and infers from tools', async () => {
    const dir = await makeRepo({
      'package.json': {
        scripts: { test: 'echo "Error: no test specified" && exit 1' },
        devDependencies: { jest: '1' },
      },
    });
    expect(kinds(await detect(dir)).test).toBe('npx jest');
  });

  it('expands workspaces into packages', async () => {
    const dir = await makeRepo({
      'package.json': {
        name: 'mono',
        private: true,
        workspaces: ['packages/*'],
        scripts: { build: 'turbo build' },
      },
      'package-lock.json': '{}',
      'turbo.json': '{}',
      'packages/ui/package.json': {
        name: '@acme/ui',
        description: 'Design system',
        scripts: { test: 'vitest' },
      },
      'packages/api/package.json': { name: '@acme/api', scripts: { build: 'tsc' } },
    });
    const profile = await detect(dir);
    expect(profile.monorepoTool).toBe('Turborepo');
    expect(profile.workspaces.map((w) => w.dir)).toEqual(['packages/api', 'packages/ui']);
    expect(profile.workspaces[1]!.commands[0]!.run).toBe('npm run test --workspace packages/ui');
  });

  it('reads a uv Python project', async () => {
    const dir = await makeRepo({
      'pyproject.toml': `[project]\nname = "acme-api"\ndescription = "Billing API"\nrequires-python = ">=3.12"\ndependencies = ["fastapi"]\n[dependency-groups]\ndev = ["pytest", "ruff", "mypy"]\n`,
      'uv.lock': '',
      'tests/test_x.py': '',
    });
    const profile = await detect(dir);
    expect(profile.name).toBe('acme-api');
    expect(profile.ecosystems[0]).toMatchObject({
      packageManager: 'uv',
      version: '>=3.12',
      frameworks: ['FastAPI'],
    });
    expect(kinds(profile)).toMatchObject({
      install: 'uv sync',
      test: 'uv run pytest',
      lint: 'uv run ruff check .',
      typecheck: 'uv run mypy .',
    });
  });

  it.each([
    [
      'go',
      { 'go.mod': 'module github.com/acme/svc\n\ngo 1.24\n' },
      { test: 'go test ./...', lint: 'go vet ./...' },
    ],
    ['rust', { 'Cargo.toml': '[workspace]\nmembers = ["a"]\n' }, { test: 'cargo test --workspace' }],
    [
      'gradle',
      { 'build.gradle.kts': 'plugins { id("org.springframework.boot") }', gradlew: '' },
      { test: './gradlew test' },
    ],
    [
      'maven',
      { 'pom.xml': '<project><properties><java.version>21</java.version></properties></project>' },
      { test: 'mvn -B test' },
    ],
    ['dotnet', { 'Acme.sln': '' }, { test: 'dotnet test' }],
    [
      'ruby',
      { Gemfile: "gem 'rspec'\ngem 'rubocop'\n" },
      { test: 'bundle exec rspec', lint: 'bundle exec rubocop' },
    ],
  ])('detects %s', async (_name, files, expected) => {
    expect(kinds(await detect(await makeRepo(files)))).toMatchObject(expected);
  });

  it('prefers task-runner targets and labels multi-language commands', async () => {
    const dir = await makeRepo({
      Makefile: '.PHONY: test\ntest:\n\tgo test ./...\nlint:\n\tgolangci-lint run\nVAR := 1\n',
      'go.mod': 'module x\n\ngo 1.24\n',
      'pyproject.toml': '[project]\nname = "x"\n',
    });
    const profile = await detect(dir);
    expect(profile.taskRunner?.targets).toEqual(['test', 'lint']);
    expect(kinds(profile)).toMatchObject({
      test: 'make test',
      lint: 'make lint',
      'build:Go': 'go build ./...',
    });
  });

  it('finds CI, containers, env examples, conventional commits and agent files', async () => {
    const dir = await makeRepo({
      '.github/workflows/ci.yml': 'jobs:\n  test:\n    steps:\n      - run: npm ci\n      - run: npm test\n',
      'compose.yaml': 'services: {}\n',
      '.env.example': 'A=1\n',
      'commitlint.config.js': '',
      'CLAUDE.md': '# hi',
      '.cursorrules': 'x',
      'README.md': '# Thing\n\n[![badge](x)](y)\n\nA tool that does things.\n',
    });
    const profile = await detect(dir);
    expect(profile.ci[0]).toMatchObject({ provider: 'GitHub Actions', runSteps: ['npm ci', 'npm test'] });
    expect(profile.containers.compose).toBe('compose.yaml');
    expect(profile.envExample).toBe('.env.example');
    expect(profile.conventionalCommits).toBe(true);
    expect(profile.existing).toEqual(expect.arrayContaining(['CLAUDE.md', '.cursorrules']));
    expect(profile.description).toBe('A tool that does things.');
  });
});
