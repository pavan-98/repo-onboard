import * as p from '@clack/prompts';
import { ALL_TARGETS, ConfigError } from '../core/config.js';
import { loadContext } from '../core/context.js';
import type { Context, TargetId } from '../core/types.js';
import { color, out } from '../report/ui.js';
import { TARGETS } from '../targets/index.js';
import { runDraft } from './draft.js';
import { type ApplyOptions, isInteractive, planAll, reviewAndApply } from './shared.js';

export interface InitOptions extends ApplyOptions {
  targets?: string;
  docsDir?: string;
  docs?: boolean;
  skills?: boolean;
  adopt?: boolean;
  draftWith?: string;
  draftCmd?: string;
  draftTimeout?: number;
  today?: string;
}

export function parseTargets(value: string): TargetId[] {
  if (value.trim() === 'all') return [...ALL_TARGETS];
  const ids = value
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const unknown = ids.filter((id) => !ALL_TARGETS.includes(id as TargetId));
  if (unknown.length)
    throw new ConfigError(`Unknown target(s): ${unknown.join(', ')}. Known: ${ALL_TARGETS.join(', ')}, all`);
  return ALL_TARGETS.filter((t) => ids.includes(t));
}

export function describeProfile(ctx: Context): void {
  const { profile } = ctx;
  const stack = profile.ecosystems.map(
    (e) => `${e.language}${e.packageManager ? ` (${e.packageManager})` : ''}`,
  );
  out.log(`  ${color('gray', 'project')}   ${profile.name}`);
  out.log(`  ${color('gray', 'stack')}     ${stack.join(', ') || 'none detected'}`);
  out.log(
    `  ${color('gray', 'commands')}  ${profile.commands.map((c) => c.kind).join(', ') || 'none detected'}`,
  );
  if (profile.workspaces.length)
    out.log(
      `  ${color('gray', 'workspace')} ${profile.workspaces.length} packages (${profile.monorepoTool})`,
    );
  if (profile.existing.length) out.log(`  ${color('gray', 'existing')}  ${profile.existing.join(', ')}`);
}

export async function runInit(options: InitOptions): Promise<number> {
  const { ctx, hasConfig } = await loadContext({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    adopt: options.adopt !== false,
    ...(options.today ? { today: options.today } : {}),
  });
  const interactive = isInteractive(options);

  if (interactive) p.intro(color('bold', 'repo-onboard'));
  else out.heading('repo-onboard init');
  describeProfile(ctx);

  if (options.targets) ctx.config.targets = parseTargets(options.targets);
  if (options.docsDir) ctx.config.docs.dir = options.docsDir.replace(/\\/g, '/').replace(/\/+$/, '');
  if (options.docs === false) ctx.config.docs.enabled = false;
  if (options.skills === false) ctx.config.skills = [];

  if (interactive) {
    const targets = await p.multiselect({
      message: 'Which AI tools should be configured? (AGENTS.md is always created)',
      options: ALL_TARGETS.map((id) => ({
        value: id,
        label: TARGETS[id].label,
        hint: TARGETS[id].description,
      })),
      initialValues: ctx.config.targets,
      required: false,
    });
    if (p.isCancel(targets)) return cancelled();
    ctx.config.targets = ALL_TARGETS.filter((t) => (targets as TargetId[]).includes(t));

    const docs = await p.confirm({
      message: 'Generate human onboarding docs (CONTRIBUTING, ONBOARDING, ARCHITECTURE, ADRs)?',
      initialValue: ctx.config.docs.enabled,
    });
    if (p.isCancel(docs)) return cancelled();
    ctx.config.docs.enabled = docs;

    if (docs) {
      const dir = await p.text({ message: 'Folder for human docs', initialValue: ctx.config.docs.dir });
      if (p.isCancel(dir)) return cancelled();
      ctx.config.docs.dir = (dir || 'docs').replace(/\\/g, '/').replace(/\/+$/, '');
    }
  }

  out.heading(hasConfig ? 'Updating files' : 'Planned files');
  const changes = await planAll(ctx, true);
  const ok = await reviewAndApply(ctx, changes, options);
  if (!ok) return 1;

  if (options.dryRun) {
    out.info('Dry run: nothing was written. Run again without --dry-run to apply.');
    return 0;
  }

  if (options.draftWith || options.draftCmd) {
    const code = await runDraft(ctx, {
      ...(options.draftWith ? { with: options.draftWith } : {}),
      ...(options.draftCmd ? { cmd: options.draftCmd } : {}),
      ...(options.draftTimeout ? { timeout: options.draftTimeout } : {}),
      ...(options.yes ? { yes: true } : {}),
    });
    if (code !== 0) return code;
  }

  const next = [
    'Review the generated files and replace any TODO(repo-onboard:…) placeholders.',
    options.draftWith
      ? ''
      : 'Or let your agent draft them: npx repo-onboard draft --with claude|codex|gemini|copilot',
    'Commit them, and add `npx repo-onboard check` to CI (see the README for the GitHub Action).',
  ].filter(Boolean);
  if (ctx.profile.existing.includes('.ai'))
    next.unshift('Found a v1 .ai/ folder: run `npx repo-onboard migrate`.');
  if (interactive) p.outro(next.join('\n'));
  else {
    out.heading('Next steps');
    for (const line of next) out.log(`  • ${line}`);
  }
  return 0;
}

function cancelled(): number {
  p.cancel('Cancelled. Nothing was written.');
  return 1;
}
