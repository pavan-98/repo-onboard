import * as p from '@clack/prompts';
import { applyChanges } from '../core/plan.js';
import type { Context } from '../core/types.js';
import {
  applyDraft,
  buildPrompt,
  DRAFT_AGENTS,
  type DraftAgent,
  findPlaceholders,
  parseDraft,
  runAgent,
} from '../draft/index.js';
import { out, printPlan } from '../report/ui.js';
import { docsPath } from '../templates/md.js';
import { type GlobalOptions, isInteractive } from './shared.js';

export interface DraftOptions extends GlobalOptions {
  with?: string;
  cmd?: string;
  timeout?: number;
  dryRun?: boolean;
}

export function placeholderFiles(ctx: Context): string[] {
  const files = ['AGENTS.md', ...ctx.profile.workspaces.map((w) => `${w.dir}/AGENTS.md`)];
  if (ctx.config.docs.enabled)
    files.push(docsPath(ctx, 'ARCHITECTURE.md'), docsPath(ctx, 'ONBOARDING.md'), 'SECURITY.md', 'README.md');
  return files;
}

export async function runDraft(ctx: Context, options: DraftOptions): Promise<number> {
  if (!options.with && !options.cmd) {
    out.error(`Choose an agent with --with <${DRAFT_AGENTS.join('|')}> or a command with --cmd "<command>".`);
    return 1;
  }
  if (options.with && !DRAFT_AGENTS.includes(options.with as DraftAgent)) {
    out.error(`Unknown agent "${options.with}". Use one of: ${DRAFT_AGENTS.join(', ')}.`);
    return 1;
  }
  const placeholders = await findPlaceholders(ctx, placeholderFiles(ctx));
  if (placeholders.length === 0) {
    out.ok('No TODO(repo-onboard:…) placeholders left to draft.');
    return 0;
  }
  const who = options.cmd ?? options.with!;
  out.info(
    `Asking ${who} to draft ${placeholders.length} section(s). It runs read-only and may take a few minutes…`,
  );
  const prompt = buildPrompt(ctx, placeholders);
  let draft: Record<string, string>;
  try {
    const output = await runAgent(ctx, prompt, {
      ...(options.with ? { agent: options.with as DraftAgent } : {}),
      ...(options.cmd ? { command: options.cmd } : {}),
      timeoutMs: (options.timeout ?? 600) * 1000,
    });
    draft = parseDraft(output);
  } catch (error) {
    out.error(`Drafting failed: ${(error as Error).message}`);
    return 1;
  }

  const changes = await applyDraft(ctx, placeholders, draft);
  if (changes.length === 0) {
    out.warn('The agent returned no usable content.');
    return 1;
  }
  out.heading('Drafted content (review before committing)');
  printPlan(changes, { diff: true });
  if (options.dryRun) return 0;
  if (isInteractive(options)) {
    const ok = await p.confirm({ message: 'Apply the drafted content?', initialValue: true });
    if (p.isCancel(ok) || !ok) {
      p.cancel('Draft discarded.');
      return 0;
    }
  }
  await applyChanges(ctx, changes);
  out.ok(`Drafted ${changes.length} file(s). Review the text: agents can be confidently wrong.`);
  return 0;
}
