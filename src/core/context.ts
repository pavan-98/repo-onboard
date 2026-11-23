import path from 'node:path';
import { detect } from '../detect/index.js';
import { CONFIG_FILE, ConfigError, defaultConfig, normalizeConfig } from './config.js';
import { readJson, readText } from './fs.js';
import type { Config, Context, TargetId } from './types.js';

export interface LoadOptions {
  cwd?: string;
  adopt?: boolean;
  today?: string;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Reads the raw config (if any), detects the repo, then validates the config against the profile. */
export async function loadContext(
  options: LoadOptions = {},
): Promise<{ ctx: Context; hasConfig: boolean; detectedTargets: TargetId[] }> {
  const root = path.resolve(options.cwd ?? process.cwd());
  const file = path.join(root, CONFIG_FILE);
  const hasConfig = (await readText(file)) !== undefined;
  const raw = hasConfig ? await readJson<Record<string, unknown>>(file) : undefined;
  if (hasConfig && raw === undefined) throw new ConfigError(`${CONFIG_FILE} is not valid JSON`);

  const ignore = Array.isArray(raw?.ignore) ? (raw.ignore as string[]) : [];
  const name = typeof raw?.name === 'string' ? raw.name : undefined;
  const profile = await detect(root, { ignore, ...(name ? { name } : {}) });

  const { detectTargets } = await import('../targets/index.js');
  const detectedTargets = detectTargets(profile);
  const config: Config = raw ? normalizeConfig(raw, profile) : defaultConfig(profile, detectedTargets);

  return {
    ctx: { root, profile, config, adopt: options.adopt ?? false, today: options.today ?? today() },
    hasConfig,
    detectedTargets,
  };
}
