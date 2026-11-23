import path from 'node:path';
import { listDir, readText } from '../core/fs.js';
import { GENERATED_MARKER, hasBlocks } from '../core/managed.js';
import type { Context, FileOp } from '../core/types.js';
import { agentsMd, nestedAgentsMd } from '../templates/agents.js';
import {
  adrIndex,
  architectureMd,
  contributingMd,
  firstAdr,
  onboardingMd,
  prTemplateMd,
  readmeMd,
  securityMd,
} from '../templates/human.js';
import { docsPath } from '../templates/md.js';
import { SKILL_TEMPLATES } from '../templates/skills.js';
import { V1 } from '../templates/v1.js';

/** Canonical agent files: AGENTS.md (root + nested) and Agent Skills. */
export async function canonicalOps(ctx: Context): Promise<FileOp[]> {
  const ops: FileOp[] = [
    { kind: 'managed', path: 'AGENTS.md', owner: 'agents', initial: agentsMd(ctx), adopt: 'append' },
  ];
  if (ctx.config.nested) {
    for (const ws of ctx.profile.workspaces) {
      ops.push({
        kind: 'managed',
        path: `${ws.dir}/AGENTS.md`,
        owner: 'agents',
        initial: nestedAgentsMd(ctx, ws),
        adopt: 'append',
      });
    }
  }
  for (const name of ctx.config.skills) {
    const template = SKILL_TEMPLATES[name];
    if (!template) continue; // user-authored skill: lives in .agents/skills already
    if (name === 'add-adr' && !ctx.config.docs.enabled) continue;
    const content = template.render(ctx);
    const skillPath = `.agents/skills/${name}/SKILL.md`;
    ops.push(
      hasBlocks(content)
        ? { kind: 'managed', path: skillPath, owner: 'agents', initial: content }
        : { kind: 'create', path: skillPath, owner: 'agents', content },
    );
  }
  return ops;
}

export interface SkillInfo {
  name: string;
  description: string;
}

function parseFrontmatter(text: string): Record<string, string> {
  const match = /^---\n([\s\S]*?)\n---/.exec(text);
  const out: Record<string, string> = {};
  if (!match) return out;
  for (const line of match[1]!.split('\n')) {
    const kv = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let value = kv[2]!.trim();
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value) as string;
      } catch {
        // keep raw
      }
    } else if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1).replace(/''/g, "'");
    out[kv[1]!] = value;
  }
  return out;
}

/** Skills that exist (or will exist after sync) in `.agents/skills`. */
export async function listSkills(ctx: Context): Promise<SkillInfo[]> {
  const skills = new Map<string, SkillInfo>();
  for (const name of ctx.config.skills) {
    const template = SKILL_TEMPLATES[name];
    if (template && !(name === 'add-adr' && !ctx.config.docs.enabled))
      skills.set(name, { name, description: template.description });
  }
  const dir = path.join(ctx.root, '.agents', 'skills');
  for (const entry of await listDir(dir)) {
    const text = await readText(path.join(dir, entry, 'SKILL.md'));
    if (!text || text.includes(GENERATED_MARKER)) continue;
    const fm = parseFrontmatter(text);
    if (fm.name && fm.description) skills.set(entry, { name: fm.name, description: fm.description });
  }
  return [...skills.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export { parseFrontmatter };

async function adrEntries(ctx: Context): Promise<{ file: string; title: string }[]> {
  const dir = path.join(ctx.root, ctx.config.docs.dir, 'adr');
  const entries = new Map<string, string>();
  entries.set('0001-record-architecture-decisions.md', '1. Record architecture decisions');
  for (const file of await listDir(dir)) {
    if (!/^\d{4}-.+\.md$/.test(file)) continue;
    const text = (await readText(path.join(dir, file))) ?? '';
    const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? file;
    entries.set(file, title);
  }
  return [...entries.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, title]) => ({ file, title }));
}

/** Human-facing docs. */
export async function docsOps(ctx: Context): Promise<FileOp[]> {
  if (!ctx.config.docs.enabled) return [];
  const legacyReadme = V1.readme;
  return [
    {
      kind: 'managed',
      path: 'CONTRIBUTING.md',
      owner: 'docs',
      initial: contributingMd(ctx),
      replaceable: [V1.contributing],
    },
    {
      kind: 'managed',
      path: docsPath(ctx, 'ONBOARDING.md'),
      owner: 'docs',
      initial: onboardingMd(ctx),
      replaceable: [V1.onboarding],
    },
    {
      kind: 'managed',
      path: docsPath(ctx, 'ARCHITECTURE.md'),
      owner: 'docs',
      initial: architectureMd(ctx),
      replaceable: [V1.architecture],
    },
    {
      kind: 'managed',
      path: docsPath(ctx, 'adr/README.md'),
      owner: 'docs',
      initial: adrIndex(await adrEntries(ctx)),
    },
    {
      kind: 'create',
      path: docsPath(ctx, 'adr/0001-record-architecture-decisions.md'),
      owner: 'docs',
      content: firstAdr(ctx.today),
    },
    { kind: 'create', path: 'SECURITY.md', owner: 'docs', content: securityMd(ctx) },
    { kind: 'create', path: '.github/pull_request_template.md', owner: 'docs', content: prTemplateMd(ctx) },
    { kind: 'create', path: 'README.md', owner: 'docs', content: readmeMd(ctx), replaceable: [legacyReadme] },
  ];
}
