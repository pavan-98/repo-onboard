import path from 'node:path';
import { exists, listDir, readJson, readText } from '../core/fs.js';
import { GENERATED_MARKER } from '../core/managed.js';
import type { Context, ContextFile, FileOp, Finding, Target } from '../core/types.js';
import { codexMcp, cursorMcp, geminiMcp, mcpEdits } from './mcp.js';

const at = (ctx: Context, p: string) => exists(path.join(ctx.root, p));

/** Codex reads AGENTS.md natively and concatenates it from the repo root down to the working folder. */
export const CODEX_MAX_BYTES = 32 * 1024;

const POINTER =
  'This repository keeps its AI agent instructions in [AGENTS.md]({link}). Read it and follow it before making changes.';

function pointer(link: string): string {
  return POINTER.replace('{link}', link);
}

export const codex: Target = {
  id: 'codex',
  label: 'OpenAI Codex',
  description: 'reads AGENTS.md and .agents/skills natively; .codex/config.toml for MCP',
  docs: 'https://developers.openai.com/codex/guides/agents-md',
  verified: '2026-11',
  detect: (profile) => profile.existing.includes('.codex') || profile.existing.includes('AGENTS.override.md'),
  async plan(ctx) {
    if (Object.keys(ctx.config.mcpServers).length === 0) return [];
    return [
      {
        kind: 'data',
        path: '.codex/config.toml',
        owner: 'codex',
        format: 'toml',
        header: `# ${GENERATED_MARKER} (mcp_servers) — managed by repo-onboard.config.json`,
        edits: mcpEdits(ctx.config.mcpServers, ['mcp_servers'], codexMcp),
      },
    ];
  },
  async contextMap(ctx) {
    const nested = ctx.profile.workspaces.filter((w) => w.dir).length;
    const skills = await listDir(path.join(ctx.root, '.agents', 'skills'));
    return [
      {
        path: 'AGENTS.md',
        role: 'project instructions (root → working folder)',
        present: await at(ctx, 'AGENTS.md'),
      },
      {
        path: 'AGENTS.override.md',
        role: 'overrides AGENTS.md in the same folder',
        present: await at(ctx, 'AGENTS.override.md'),
      },
      {
        path: '<package>/AGENTS.md',
        role: `nested instructions (${nested} workspace packages)`,
        present: nested > 0 && ctx.config.nested,
      },
      { path: '.agents/skills/', role: `skills (${skills.length})`, present: skills.length > 0 },
      {
        path: '.codex/config.toml',
        role: 'project MCP servers and settings',
        present: await at(ctx, '.codex/config.toml'),
      },
    ];
  },
  async check(ctx) {
    const findings: Finding[] = [];
    if (await at(ctx, 'AGENTS.override.md'))
      findings.push({
        rule: 'codex/override',
        severity: 'info',
        target: 'codex',
        file: 'AGENTS.override.md',
        message: 'AGENTS.override.md replaces AGENTS.md for Codex in this folder; other tools ignore it.',
      });
    return findings;
  },
};

export const gemini: Target = {
  id: 'gemini',
  label: 'Gemini CLI',
  description: '.gemini/settings.json → context.fileName includes AGENTS.md; MCP servers',
  docs: 'https://geminicli.com/docs/cli/gemini-md/',
  verified: '2026-11',
  detect: (profile) => profile.existing.includes('.gemini') || profile.existing.includes('GEMINI.md'),
  async plan(ctx) {
    return [
      {
        kind: 'data',
        path: '.gemini/settings.json',
        owner: 'gemini',
        format: 'json',
        edits: [
          { op: 'union', path: ['context', 'fileName'], values: ['AGENTS.md', 'GEMINI.md'] },
          ...mcpEdits(ctx.config.mcpServers, ['mcpServers'], geminiMcp),
        ],
      },
    ];
  },
  async contextMap(ctx) {
    const settings = await readJson<{
      context?: { fileName?: string | string[] };
      contextFileName?: string | string[];
    }>(path.join(ctx.root, '.gemini', 'settings.json'));
    const raw = settings?.context?.fileName ?? settings?.contextFileName ?? 'GEMINI.md';
    const names = Array.isArray(raw) ? raw : [raw];
    const files: ContextFile[] = [];
    for (const name of names)
      files.push({ path: name, role: 'context file (context.fileName)', present: await at(ctx, name) });
    files.push({
      path: '.gemini/settings.json',
      role: 'project settings and MCP servers',
      present: !!settings,
    });
    const commands = await listDir(path.join(ctx.root, '.gemini', 'commands'));
    files.push({
      path: '.gemini/commands/',
      role: `custom commands (${commands.length})`,
      present: commands.length > 0,
    });
    return files;
  },
};

export const cursor: Target = {
  id: 'cursor',
  label: 'Cursor',
  description: 'reads AGENTS.md natively; .cursor/mcp.json for MCP',
  docs: 'https://cursor.com/docs/context/rules',
  verified: '2026-11',
  detect: (profile) => profile.existing.includes('.cursor') || profile.existing.includes('.cursorrules'),
  async plan(ctx) {
    if (Object.keys(ctx.config.mcpServers).length === 0) return [];
    return [
      {
        kind: 'data',
        path: '.cursor/mcp.json',
        owner: 'cursor',
        format: 'json',
        edits: mcpEdits(ctx.config.mcpServers, ['mcpServers'], cursorMcp),
      },
    ];
  },
  async contextMap(ctx) {
    const rules = await listDir(path.join(ctx.root, '.cursor', 'rules'));
    return [
      { path: 'AGENTS.md', role: 'project instructions', present: await at(ctx, 'AGENTS.md') },
      { path: '.cursor/rules/', role: `project rules (${rules.length})`, present: rules.length > 0 },
      { path: '.cursorrules', role: 'legacy rules file', present: await at(ctx, '.cursorrules') },
      { path: '.cursor/mcp.json', role: 'project MCP servers', present: await at(ctx, '.cursor/mcp.json') },
    ];
  },
  async check(ctx) {
    return (await at(ctx, '.cursorrules'))
      ? [
          {
            rule: 'legacy/cursorrules',
            severity: 'warning',
            target: 'cursor',
            file: '.cursorrules',
            message:
              '.cursorrules is a legacy format. Move its content into AGENTS.md (shared) or .cursor/rules/ and delete it.',
          },
        ]
      : [];
  },
};

function pointerTarget(options: {
  id: string;
  label: string;
  file: string;
  docs: string;
  detectFiles: string[];
  render: (link: string) => string;
  legacy?: string;
}): Target {
  return {
    id: options.id,
    label: options.label,
    description: `${options.file} pointing to AGENTS.md`,
    docs: options.docs,
    verified: '2026-11',
    detect: (profile) => options.detectFiles.some((f) => profile.existing.includes(f)),
    async plan() {
      const link = path.posix.relative(path.posix.dirname(options.file), 'AGENTS.md');
      const ops: FileOp[] = [
        { kind: 'generated', path: options.file, owner: options.id, content: options.render(link) },
      ];
      return ops;
    },
    async contextMap(ctx) {
      const files: ContextFile[] = [
        { path: options.file, role: 'rule pointing to AGENTS.md', present: await at(ctx, options.file) },
        { path: 'AGENTS.md', role: 'project instructions', present: await at(ctx, 'AGENTS.md') },
      ];
      if (options.legacy)
        files.push({
          path: options.legacy,
          role: 'legacy rules file',
          present: await at(ctx, options.legacy),
        });
      return files;
    },
    async check(ctx) {
      if (!options.legacy || !(await at(ctx, options.legacy))) return [];
      return [
        {
          rule: `legacy/${options.id}`,
          severity: 'warning',
          target: options.id,
          file: options.legacy,
          message: `${options.legacy} is a legacy format. Move its content into AGENTS.md and delete it.`,
        },
      ];
    },
  };
}

export const windsurf = pointerTarget({
  id: 'windsurf',
  label: 'Windsurf',
  file: '.windsurf/rules/agents.md',
  docs: 'https://docs.windsurf.com/windsurf/cascade/memories',
  detectFiles: ['.windsurf', '.windsurfrules'],
  legacy: '.windsurfrules',
  render: (link) => `---\ntrigger: always_on\n---\n<!-- ${GENERATED_MARKER} -->\n\n${pointer(link)}\n`,
});

export const cline = pointerTarget({
  id: 'cline',
  label: 'Cline',
  file: '.clinerules/agents.md',
  docs: 'https://docs.cline.bot/features/cline-rules',
  detectFiles: ['.clinerules'],
  render: (link) => `<!-- ${GENERATED_MARKER} -->\n\n${pointer(link)}\n`,
});

export const junie = pointerTarget({
  id: 'junie',
  label: 'JetBrains Junie',
  file: '.junie/guidelines.md',
  docs: 'https://www.jetbrains.com/help/junie/customize-guidelines.html',
  detectFiles: ['.junie'],
  render: (link) => `<!-- ${GENERATED_MARKER} -->\n\n${pointer(link)}\n`,
});

export const kiro = pointerTarget({
  id: 'kiro',
  label: 'Kiro',
  file: '.kiro/steering/agents.md',
  docs: 'https://kiro.dev/docs/steering/',
  detectFiles: ['.kiro'],
  render: () =>
    `---\ninclusion: always\n---\n<!-- ${GENERATED_MARKER} -->\n\nThis repository keeps its AI agent instructions in AGENTS.md:\n\n#[[file:AGENTS.md]]\n`,
});

export const aider: Target = {
  id: 'aider',
  label: 'Aider',
  description: '.aider.conf.yml reads AGENTS.md',
  docs: 'https://aider.chat/docs/usage/conventions.html',
  verified: '2026-11',
  detect: (profile) =>
    profile.existing.includes('.aider.conf.yml') || profile.existing.includes('CONVENTIONS.md'),
  async plan() {
    return [
      {
        kind: 'data',
        path: '.aider.conf.yml',
        owner: 'aider',
        format: 'yaml',
        header: '# Aider configuration. repo-onboard ensures AGENTS.md is always read.',
        edits: [{ op: 'union', path: ['read'], values: ['AGENTS.md'] }],
      },
    ];
  },
  async contextMap(ctx) {
    const conf = (await readText(path.join(ctx.root, '.aider.conf.yml'))) ?? '';
    return [
      { path: '.aider.conf.yml', role: 'config (read: AGENTS.md)', present: conf.includes('AGENTS.md') },
      { path: 'AGENTS.md', role: 'conventions loaded read-only', present: await at(ctx, 'AGENTS.md') },
      { path: 'CONVENTIONS.md', role: 'legacy conventions file', present: await at(ctx, 'CONVENTIONS.md') },
    ];
  },
};
