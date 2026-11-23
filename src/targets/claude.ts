import path from 'node:path';
import { exists, listDir, relLink } from '../core/fs.js';
import { block, GENERATED_MARKER } from '../core/managed.js';
import type { FileOp, Target } from '../core/types.js';
import { listSkills } from './core.js';
import { claudeMcp, mcpEdits } from './mcp.js';

function claudeMd(importPath: string, nested: boolean): string {
  return `${block('import', `@${importPath}`)}

# Claude Code

${nested ? 'Package' : 'Project'} instructions live in [${importPath}](${importPath}) (imported above) so that every AI tool shares them.
Add only Claude-specific notes below; put anything that applies to all agents in \`AGENTS.md\`.
`;
}

/** Turns a command into a Claude Code permission rule prefix, e.g. `Bash(npm run lint:*)`. */
export function permissionRule(command: string): string {
  const tokens: string[] = [];
  for (const token of command.split(/\s+/)) {
    if (token.startsWith('-') || token.includes('...') || token === '.' || token.startsWith('<')) break;
    tokens.push(token);
    if (tokens.length === 4) break;
  }
  return `Bash(${tokens.join(' ')}:*)`;
}

export const claude: Target = {
  id: 'claude',
  label: 'Claude Code',
  description: 'CLAUDE.md importing AGENTS.md, permissions, skills, .mcp.json',
  docs: 'https://code.claude.com/docs/en/memory',
  verified: '2026-11',

  detect: (profile) =>
    profile.existing.some((f) => f === 'CLAUDE.md' || f === '.claude' || f === '.mcp.json'),

  async plan(ctx) {
    const ops: FileOp[] = [
      {
        kind: 'managed',
        path: 'CLAUDE.md',
        owner: 'claude',
        initial: claudeMd('AGENTS.md', false),
        ensureTop: ['import'],
      },
    ];
    if (ctx.config.nested) {
      for (const ws of ctx.profile.workspaces) {
        ops.push({
          kind: 'managed',
          path: `${ws.dir}/CLAUDE.md`,
          owner: 'claude',
          initial: claudeMd('AGENTS.md', true),
          ensureTop: ['import'],
        });
      }
    }

    const allow = [
      ...new Set(
        ctx.profile.commands
          .filter((c) => ['build', 'test', 'lint', 'typecheck', 'format'].includes(c.kind))
          .map((c) => permissionRule(c.run)),
      ),
    ];
    ops.push({
      kind: 'data',
      path: '.claude/settings.json',
      owner: 'claude',
      format: 'json',
      edits: [
        { op: 'default', path: ['$schema'], value: 'https://json.schemastore.org/claude-code-settings.json' },
        { op: 'union', path: ['permissions', 'allow'], values: allow },
        {
          op: 'union',
          path: ['permissions', 'deny'],
          values: ['Read(./.env)', 'Read(./.env.*)', 'Read(./**/*.pem)', 'Read(./**/*.key)'],
        },
      ],
    });

    for (const skill of await listSkills(ctx)) {
      const file = `.claude/skills/${skill.name}/SKILL.md`;
      const target = `.agents/skills/${skill.name}/SKILL.md`;
      ops.push({
        kind: 'generated',
        path: file,
        owner: 'claude',
        content: `---\nname: ${skill.name}\ndescription: ${JSON.stringify(skill.description)}\n---\n<!-- ${GENERATED_MARKER}: edit ${target} instead -->\n\nRead and follow [${target}](${relLink(file, target)}).\n`,
      });
    }

    if (Object.keys(ctx.config.mcpServers).length) {
      ops.push({
        kind: 'data',
        path: '.mcp.json',
        owner: 'claude',
        format: 'json',
        edits: mcpEdits(ctx.config.mcpServers, ['mcpServers'], claudeMcp),
      });
    }
    return ops;
  },

  async contextMap(ctx) {
    const at = (p: string) => exists(path.join(ctx.root, p));
    const skills = await listDir(path.join(ctx.root, '.claude', 'skills'));
    return [
      { path: 'CLAUDE.md', role: 'project memory (loaded at start)', present: await at('CLAUDE.md') },
      { path: 'AGENTS.md', role: 'imported by CLAUDE.md via @AGENTS.md', present: await at('AGENTS.md') },
      { path: 'CLAUDE.local.md', role: 'personal, git-ignored memory', present: await at('CLAUDE.local.md') },
      {
        path: '.claude/settings.json',
        role: 'permissions and hooks',
        present: await at('.claude/settings.json'),
      },
      { path: '.claude/skills/', role: `skills (${skills.length})`, present: skills.length > 0 },
      { path: '.mcp.json', role: 'project MCP servers', present: await at('.mcp.json') },
    ];
  },
};
