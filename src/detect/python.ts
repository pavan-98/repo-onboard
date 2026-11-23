import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { exists, firstExisting, isDir, listDir, readText } from '../core/fs.js';
import type { Command, Ecosystem } from '../core/types.js';

type Toml = Record<string, any>;

const FRAMEWORKS: Record<string, string> = {
  django: 'Django',
  flask: 'Flask',
  fastapi: 'FastAPI',
  starlette: 'Starlette',
  streamlit: 'Streamlit',
  torch: 'PyTorch',
  tensorflow: 'TensorFlow',
  'scikit-learn': 'scikit-learn',
  pandas: 'pandas',
  celery: 'Celery',
  sqlalchemy: 'SQLAlchemy',
  pydantic: 'Pydantic',
};

export interface PythonDetection {
  ecosystem: Ecosystem;
  name?: string;
  description?: string;
}

function depNames(pyproject: Toml, extraText: string): Set<string> {
  const raw: string[] = [];
  const project = pyproject.project ?? {};
  raw.push(...(project.dependencies ?? []));
  for (const list of Object.values(project['optional-dependencies'] ?? {})) raw.push(...(list as string[]));
  for (const list of Object.values(pyproject['dependency-groups'] ?? {}))
    raw.push(...(list as unknown[]).filter((d): d is string => typeof d === 'string'));
  const poetry = pyproject.tool?.poetry ?? {};
  raw.push(...Object.keys(poetry.dependencies ?? {}), ...Object.keys(poetry['dev-dependencies'] ?? {}));
  for (const group of Object.values(poetry.group ?? {}))
    raw.push(...Object.keys((group as Toml).dependencies ?? {}));
  raw.push(...extraText.split('\n'));
  const names = new Set<string>();
  for (const entry of raw) {
    const match = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(entry);
    if (match && !entry.trim().startsWith('#') && !entry.trim().startsWith('-'))
      names.add(match[1]!.toLowerCase().replace(/_/g, '-'));
  }
  return names;
}

export async function detectPython(root: string): Promise<PythonDetection | undefined> {
  const pyprojectText = await readText(path.join(root, 'pyproject.toml'));
  const requirements = await firstExisting(root, ['requirements.txt', 'requirements-dev.txt']);
  const setupPy = await exists(path.join(root, 'setup.py'));
  const pipfile = await exists(path.join(root, 'Pipfile'));
  if (!pyprojectText && !requirements && !setupPy && !pipfile) return undefined;

  let pyproject: Toml = {};
  try {
    if (pyprojectText) pyproject = parseToml(pyprojectText) as Toml;
  } catch {
    pyproject = {};
  }
  const tool = pyproject.tool ?? {};

  let reqText = '';
  for (const file of ['requirements.txt', 'requirements-dev.txt', 'requirements/dev.txt']) {
    reqText += `${(await readText(path.join(root, file))) ?? ''}\n`;
  }
  const deps = depNames(pyproject, reqText);
  const has = (name: string) => deps.has(name);

  let pm = 'pip';
  if ((await exists(path.join(root, 'uv.lock'))) || tool.uv) pm = 'uv';
  else if ((await exists(path.join(root, 'poetry.lock'))) || tool.poetry) pm = 'poetry';
  else if ((await exists(path.join(root, 'pdm.lock'))) || tool.pdm) pm = 'pdm';
  else if (pipfile) pm = 'pipenv';

  const run = { uv: 'uv run ', poetry: 'poetry run ', pdm: 'pdm run ', pipenv: 'pipenv run ', pip: '' }[pm]!;

  let install: string;
  if (pm === 'uv') install = 'uv sync';
  else if (pm === 'poetry') install = 'poetry install';
  else if (pm === 'pdm') install = 'pdm install';
  else if (pm === 'pipenv') install = 'pipenv install --dev';
  else if (requirements) install = `pip install -r ${requirements}`;
  else if (pyproject.project?.['optional-dependencies']?.dev) install = 'pip install -e ".[dev]"';
  else install = 'pip install -e .';

  const hasTests = (await isDir(path.join(root, 'tests'))) || (await isDir(path.join(root, 'test')));
  const pytest =
    has('pytest') ||
    tool.pytest !== undefined ||
    (await exists(path.join(root, 'pytest.ini'))) ||
    (await exists(path.join(root, 'conftest.py')));
  const ruff =
    has('ruff') || tool.ruff !== undefined || !!(await firstExisting(root, ['ruff.toml', '.ruff.toml']));
  const black = has('black') || tool.black !== undefined;
  const mypy = has('mypy') || tool.mypy !== undefined || (await exists(path.join(root, 'mypy.ini')));
  const pyright =
    has('pyright') || tool.pyright !== undefined || (await exists(path.join(root, 'pyrightconfig.json')));

  const tools: string[] = [];
  if (pytest) tools.push('pytest');
  if (ruff) tools.push('Ruff');
  if (black) tools.push('Black');
  if (mypy) tools.push('mypy');
  if (pyright) tools.push('Pyright');
  if (await exists(path.join(root, 'tox.ini'))) tools.push('tox');
  if (await exists(path.join(root, 'noxfile.py'))) tools.push('nox');

  const frameworks = Object.entries(FRAMEWORKS)
    .filter(([dep]) => has(dep))
    .map(([, label]) => label);

  const source = pyprojectText ? 'pyproject.toml' : (requirements ?? 'Pipfile');
  const commands: Command[] = [{ kind: 'install', run: install, source }];
  if (await exists(path.join(root, 'manage.py')))
    commands.push({ kind: 'dev', run: `${run}python manage.py runserver`, source: 'manage.py' });
  if (pytest) commands.push({ kind: 'test', run: `${run}pytest`, source });
  else if (hasTests) commands.push({ kind: 'test', run: `${run}python -m unittest`, source: 'inferred' });
  if (ruff) {
    commands.push({ kind: 'lint', run: `${run}ruff check .`, source });
    commands.push({ kind: 'format', run: `${run}ruff format .`, source });
  } else if (black) {
    commands.push({ kind: 'format', run: `${run}black .`, source });
  }
  if (mypy) commands.push({ kind: 'typecheck', run: `${run}mypy .`, source });
  else if (pyright) commands.push({ kind: 'typecheck', run: `${run}pyright`, source });

  let version: string | undefined;
  let versionFile: string | undefined;
  const pinned = (await readText(path.join(root, '.python-version')))?.trim().split('\n')[0];
  if (pinned) {
    version = pinned;
    versionFile = '.python-version';
  } else if (pyproject.project?.['requires-python']) {
    version = String(pyproject.project['requires-python']);
    versionFile = 'pyproject.toml';
  }

  // Only keep extra test globs for folders that exist.
  const testGlobs = ['**/test_*.py', '**/*_test.py'];
  for (const dir of ['tests', 'test']) {
    if ((await listDir(path.join(root, dir))).length > 0) testGlobs.unshift(`${dir}/**/*.py`);
  }

  return {
    ecosystem: {
      id: 'python',
      label: 'Python',
      language: 'Python',
      ...(version ? { version } : {}),
      ...(versionFile ? { versionFile } : {}),
      packageManager: pm,
      manifest: source,
      tools,
      frameworks,
      commands,
      ...(pytest ? { singleTest: `${run}pytest <path/to/test_file.py>::<test_name>` } : {}),
      testGlobs,
    },
    ...(pyproject.project?.name || tool.poetry?.name
      ? { name: String(pyproject.project?.name ?? tool.poetry?.name) }
      : {}),
    ...(pyproject.project?.description || tool.poetry?.description
      ? { description: String(pyproject.project?.description ?? tool.poetry?.description) }
      : {}),
  };
}
