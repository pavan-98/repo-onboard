import type { Command, CommandKind, Context, RepoProfile } from '../core/types.js';

export const KIND_LABELS: Record<CommandKind, string> = {
  install: 'Install dependencies',
  dev: 'Run locally',
  build: 'Build',
  test: 'Test',
  lint: 'Lint',
  format: 'Format',
  typecheck: 'Type-check',
};

export function code(text: string): string {
  const fence = text.includes('`') ? '``' : '`';
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function cell(text: string): string {
  return text.replace(/\|/g, '\\|');
}

export function table(headers: string[], rows: string[][]): string {
  const head = `| ${headers.join(' | ')} |`;
  const sep = `|${headers.map(() => '---').join('|')}|`;
  return [head, sep, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

export function list(items: string[]): string {
  return items.map((i) => `- ${i}`).join('\n');
}

export function commandLabel(cmd: Command): string {
  return cmd.scope ? `${KIND_LABELS[cmd.kind]} (${cmd.scope})` : KIND_LABELS[cmd.kind];
}

export function commandsTable(commands: Command[]): string {
  if (commands.length === 0)
    return '_No build, test or lint commands were detected. Add them to your manifest or task runner, then run `npx repo-onboard sync`._';
  return table(
    ['Task', 'Command'],
    commands.map((c) => [commandLabel(c), code(c.run)]),
  );
}

export function find(profile: RepoProfile, kind: CommandKind): Command[] {
  return profile.commands.filter((c) => c.kind === kind);
}

/** Commands an agent should run to verify a change, in order. */
export function verifyCommands(profile: RepoProfile): Command[] {
  return (['lint', 'typecheck', 'test', 'build'] as CommandKind[]).flatMap((k) => find(profile, k));
}

export function docsPath(ctx: Context, file: string): string {
  return `${ctx.config.docs.dir}/${file}`;
}

export function stackLines(profile: RepoProfile): string[] {
  const lines: string[] = [];
  for (const eco of profile.ecosystems) {
    const runtime = eco.label === eco.language ? eco.label : `${eco.language} on ${eco.label}`;
    const version = eco.version
      ? ` ${eco.version}${eco.versionFile ? ` (from \`${eco.versionFile}\`)` : ''}`
      : '';
    const parts = [`**${runtime}**${version}`];
    if (eco.packageManager) parts.push(`package manager: ${eco.packageManager}`);
    if (eco.frameworks.length) parts.push(`frameworks: ${eco.frameworks.join(', ')}`);
    const tools = eco.tools.filter((t) => t !== eco.language);
    if (tools.length) parts.push(`tooling: ${tools.join(', ')}`);
    lines.push(parts.join(' · '));
  }
  if (profile.monorepoTool)
    lines.push(`**Monorepo:** ${profile.monorepoTool} (${profile.workspaces.length} packages)`);
  if (profile.taskRunner)
    lines.push(`**Task runner:** ${profile.taskRunner.tool} (\`${profile.taskRunner.file}\`)`);
  const containers: string[] = [];
  if (profile.containers.dockerfile) containers.push('`Dockerfile`');
  if (profile.containers.compose) containers.push(`\`${profile.containers.compose}\``);
  if (profile.containers.devcontainer) containers.push('dev container');
  if (containers.length) lines.push(`**Containers:** ${containers.join(', ')}`);
  if (profile.ci.length) lines.push(`**CI:** ${[...new Set(profile.ci.map((c) => c.provider))].join(', ')}`);
  return lines;
}

export function repoMap(profile: RepoProfile): string {
  if (profile.topLevel.length === 0 && profile.workspaces.length === 0) return '_No folders detected yet._';
  const lines = profile.topLevel.map((e) => `- \`${e.path}/\`${e.description ? ` — ${e.description}` : ''}`);
  if (profile.workspaces.length) {
    lines.push('', '**Workspace packages**', '');
    for (const ws of profile.workspaces) {
      lines.push(`- \`${ws.dir}/\` — \`${ws.name}\`${ws.description ? `: ${ws.description}` : ''}`);
    }
  }
  return lines.join('\n');
}
