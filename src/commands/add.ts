import path from 'node:path';
import { ALL_TARGETS, BUILTIN_SKILLS, CONFIG_FILE, ConfigError } from '../core/config.js';
import { loadContext } from '../core/context.js';
import { exists, listDir, writeText } from '../core/fs.js';
import type { Context, McpServer, TargetId } from '../core/types.js';
import { out } from '../report/ui.js';
import { adrTemplate } from '../templates/human.js';
import { docsPath } from '../templates/md.js';
import { customSkill } from '../templates/skills.js';
import { type ApplyOptions, planAll, reviewAndApply } from './shared.js';

async function load(options: ApplyOptions & { today?: string }): Promise<Context | undefined> {
  const { ctx, hasConfig } = await loadContext({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    ...(options.today ? { today: options.today } : {}),
  });
  if (!hasConfig) {
    out.error(`${CONFIG_FILE} not found. Run \`npx repo-onboard init\` first.`);
    return undefined;
  }
  return ctx;
}

async function saveAndSync(ctx: Context, options: ApplyOptions): Promise<number> {
  const changes = await planAll(ctx, true);
  return (await reviewAndApply(ctx, changes, options)) ? 0 : 1;
}

export async function addTarget(ids: string[], options: ApplyOptions): Promise<number> {
  const ctx = await load(options);
  if (!ctx) return 1;
  const unknown = ids.filter((id) => !ALL_TARGETS.includes(id as TargetId));
  if (unknown.length)
    throw new ConfigError(`Unknown target(s): ${unknown.join(', ')}. Known: ${ALL_TARGETS.join(', ')}`);
  ctx.config.targets = ALL_TARGETS.filter((t) => ctx.config.targets.includes(t) || ids.includes(t));
  return saveAndSync(ctx, options);
}

export async function addSkill(
  name: string,
  options: ApplyOptions & { description?: string },
): Promise<number> {
  const ctx = await load(options);
  if (!ctx) return 1;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    out.error('Skill names must be lowercase letters, digits and hyphens (max 64 characters).');
    return 1;
  }
  if (!ctx.config.skills.includes(name)) ctx.config.skills.push(name);
  const builtin = (BUILTIN_SKILLS as readonly string[]).includes(name);
  const file = path.join(ctx.root, '.agents', 'skills', name, 'SKILL.md');
  if (!builtin && !(await exists(file)) && !options.dryRun) {
    const description =
      options.description ?? `TODO: describe what the ${name} skill does and when an agent should use it.`;
    await writeText(file, customSkill(name, description));
    out.ok(`Created .agents/skills/${name}/SKILL.md — write the steps, then run \`npx repo-onboard sync\`.`);
  }
  return saveAndSync(ctx, options);
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= 60) return slug || 'decision';
  const cut = slug.slice(0, 61);
  return cut.slice(0, cut.lastIndexOf('-')) || slug.slice(0, 60);
}

export async function addAdr(
  title: string,
  options: ApplyOptions & { today?: string; status?: string },
): Promise<number> {
  const ctx = await load(options);
  if (!ctx) return 1;
  if (!ctx.config.docs.enabled) {
    out.error('Docs are disabled in repo-onboard.config.json ("docs.enabled": false).');
    return 1;
  }
  const dir = path.join(ctx.root, ctx.config.docs.dir, 'adr');
  const numbers = (await listDir(dir)).map((f) => Number(/^(\d{4})-/.exec(f)?.[1] ?? 0));
  const next = Math.max(1, ...numbers) + 1;
  const file = `${String(next).padStart(4, '0')}-${slugify(title)}.md`;
  const rel = docsPath(ctx, `adr/${file}`);
  if (options.dryRun) {
    out.info(`Would create ${rel}`);
    return 0;
  }
  await writeText(
    path.join(ctx.root, rel),
    adrTemplate(next, title.trim(), ctx.today, options.status ?? 'proposed'),
  );
  out.ok(`Created ${rel}`);
  return saveAndSync(ctx, { ...options, yes: true });
}

export async function addMcp(
  name: string,
  commandOrUrl: string,
  args: string[],
  options: ApplyOptions & { env?: string[]; header?: string[] },
): Promise<number> {
  const ctx = await load(options);
  if (!ctx) return 1;
  const pairs = (list: string[] | undefined, flag: string): Record<string, string> | undefined => {
    if (!list?.length) return undefined;
    const out: Record<string, string> = {};
    for (const item of list) {
      const at = item.indexOf(flag === '--header' ? ':' : '=');
      if (at <= 0)
        throw new ConfigError(
          `${flag} expects ${flag === '--header' ? 'Name: value' : 'KEY=value'}, got "${item}"`,
        );
      out[item.slice(0, at).trim()] = item.slice(at + 1).trim();
    }
    return out;
  };
  const env = pairs(options.env, '--env');
  const headers = pairs(options.header, '--header');
  const server: McpServer = /^https?:\/\//.test(commandOrUrl)
    ? { url: commandOrUrl, ...(headers ? { headers } : {}) }
    : { command: commandOrUrl, ...(args.length ? { args } : {}), ...(env ? { env } : {}) };
  ctx.config.mcpServers = { ...ctx.config.mcpServers, [name]: server };
  out.info(`Adding MCP server "${name}" for: ${ctx.config.targets.join(', ')}`);
  return saveAndSync(ctx, options);
}
