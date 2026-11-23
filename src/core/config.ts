import path from 'node:path';
import { readJson, readText, writeText } from './fs.js';
import type { Boundaries, Config, McpServer, RepoProfile, TargetId } from './types.js';

export const CONFIG_FILE = 'repo-onboard.config.json';
export const SCHEMA_URL = 'https://unpkg.com/repo-onboard@2/schema/repo-onboard.schema.json';

export const ALL_TARGETS: readonly TargetId[] = [
  'claude',
  'codex',
  'copilot',
  'gemini',
  'cursor',
  'windsurf',
  'cline',
  'junie',
  'kiro',
  'aider',
];

export const DEFAULT_TARGETS: readonly TargetId[] = ['claude', 'codex', 'copilot', 'gemini'];

export const BUILTIN_SKILLS = ['repo-onboard', 'run-checks', 'add-adr'] as const;

export const DEFAULT_BOUNDARIES: Boundaries = {
  always: [
    'Run the lint, type-check and test commands above before saying a task is done.',
    'Keep changes small and focused; match the style of the surrounding code.',
    'Update docs and this file when you change commands, structure or conventions.',
  ],
  askFirst: [
    'Adding, removing or upgrading dependencies.',
    'Changing CI/CD workflows, release, deployment or infrastructure config.',
    'Deleting files, renaming public APIs or making large cross-module refactors.',
    'Changing database schemas or data migrations.',
  ],
  never: [
    'Commit secrets, credentials, tokens or `.env` files.',
    'Skip, delete or weaken tests to make them pass.',
    'Force-push to shared branches or rewrite published history.',
    'Hand-edit generated, vendored or build output (lockfiles, `dist/`, sections between `repo-onboard` markers).',
  ],
};

export function defaultConfig(profile: RepoProfile, detectedTargets: TargetId[] = []): Config {
  const targets = [...DEFAULT_TARGETS, ...detectedTargets.filter((t) => !DEFAULT_TARGETS.includes(t))];
  return {
    $schema: SCHEMA_URL,
    version: 2,
    targets: ALL_TARGETS.filter((t) => targets.includes(t)),
    docs: { enabled: true, dir: 'docs' },
    skills: [...BUILTIN_SKILLS],
    nested: profile.workspaces.length > 0,
    boundaries: structuredClone(DEFAULT_BOUNDARIES),
    mcpServers: {},
    ignore: [],
  };
}

export class ConfigError extends Error {}

function assertStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string'))
    throw new ConfigError(`${CONFIG_FILE}: "${field}" must be an array of strings`);
  return value as string[];
}

/** Validates and fills defaults for a parsed config object. */
export function normalizeConfig(raw: unknown, profile: RepoProfile): Config {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new ConfigError(`${CONFIG_FILE} must contain a JSON object`);
  const input = raw as Record<string, unknown>;
  const base = defaultConfig(profile);

  if (input.version !== undefined && input.version !== 2)
    throw new ConfigError(`${CONFIG_FILE}: unsupported "version" ${String(input.version)} (expected 2)`);

  const targets = input.targets === undefined ? base.targets : assertStringArray(input.targets, 'targets');
  const unknown = targets.filter((t) => !ALL_TARGETS.includes(t as TargetId));
  if (unknown.length > 0)
    throw new ConfigError(
      `${CONFIG_FILE}: unknown target(s) ${unknown.join(', ')}. Known: ${ALL_TARGETS.join(', ')}`,
    );

  const docsIn = (input.docs ?? {}) as Record<string, unknown>;
  const dir = typeof docsIn.dir === 'string' && docsIn.dir.trim() !== '' ? docsIn.dir : base.docs.dir;
  if (path.isAbsolute(dir) || dir.split(/[\\/]/).includes('..'))
    throw new ConfigError(`${CONFIG_FILE}: "docs.dir" must be a relative path inside the repository`);

  const boundariesIn = (input.boundaries ?? {}) as Record<string, unknown>;
  const boundaries: Boundaries = {
    always:
      boundariesIn.always === undefined
        ? base.boundaries.always
        : assertStringArray(boundariesIn.always, 'boundaries.always'),
    askFirst:
      boundariesIn.askFirst === undefined
        ? base.boundaries.askFirst
        : assertStringArray(boundariesIn.askFirst, 'boundaries.askFirst'),
    never:
      boundariesIn.never === undefined
        ? base.boundaries.never
        : assertStringArray(boundariesIn.never, 'boundaries.never'),
  };

  const mcpIn = (input.mcpServers ?? {}) as Record<string, McpServer>;
  for (const [name, server] of Object.entries(mcpIn)) {
    if (!server || typeof server !== 'object' || (!server.command && !server.url))
      throw new ConfigError(`${CONFIG_FILE}: MCP server "${name}" needs a "command" or a "url"`);
  }

  return {
    $schema: typeof input.$schema === 'string' ? input.$schema : SCHEMA_URL,
    version: 2,
    ...(typeof input.name === 'string' ? { name: input.name } : {}),
    targets: ALL_TARGETS.filter((t) => targets.includes(t)),
    docs: {
      enabled: typeof docsIn.enabled === 'boolean' ? docsIn.enabled : true,
      dir: dir.replace(/\\/g, '/').replace(/\/+$/, ''),
    },
    skills: input.skills === undefined ? base.skills : assertStringArray(input.skills, 'skills'),
    nested: typeof input.nested === 'boolean' ? input.nested : base.nested,
    boundaries,
    mcpServers: mcpIn,
    ignore: input.ignore === undefined ? [] : assertStringArray(input.ignore, 'ignore'),
  };
}

export async function configExists(root: string): Promise<boolean> {
  return (await readText(path.join(root, CONFIG_FILE))) !== undefined;
}

export async function loadConfig(root: string, profile: RepoProfile): Promise<Config | undefined> {
  const file = path.join(root, CONFIG_FILE);
  if ((await readText(file)) === undefined) return undefined;
  const raw = await readJson(file);
  if (raw === undefined) throw new ConfigError(`${CONFIG_FILE} is not valid JSON`);
  return normalizeConfig(raw, profile);
}

export function serializeConfig(config: Config): string {
  const { $schema, ...rest } = config;
  return `${JSON.stringify({ $schema: $schema ?? SCHEMA_URL, ...rest }, null, 2)}\n`;
}

export async function saveConfig(root: string, config: Config): Promise<void> {
  await writeText(path.join(root, CONFIG_FILE), serializeConfig(config));
}
