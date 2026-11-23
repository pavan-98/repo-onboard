import path from 'node:path';
import * as p from '@clack/prompts';
import { CONFIG_FILE, serializeConfig } from '../core/config.js';
import { readText } from '../core/fs.js';
import { applyChanges, planChanges } from '../core/plan.js';
import type { Context, FileOp, PlannedChange } from '../core/types.js';
import { printPlan } from '../report/ui.js';
import { buildOps } from '../targets/index.js';

export interface GlobalOptions {
  cwd?: string;
  yes?: boolean;
}

/** Prompts only when a human is at a terminal and did not pass --yes. */
export function isInteractive(options: GlobalOptions): boolean {
  return !options.yes && !!process.stdin.isTTY && !!process.stdout.isTTY && !process.env.CI;
}

/** Plans every generated file; with `includeConfig`, also (re)writes repo-onboard.config.json. */
export async function planAll(ctx: Context, includeConfig: boolean): Promise<PlannedChange[]> {
  const changes = await planChanges(ctx, await buildOps(ctx));
  if (!includeConfig) return changes;
  const before = await readText(path.join(ctx.root, CONFIG_FILE));
  const after = serializeConfig(ctx.config);
  const op: FileOp = { kind: 'create', path: CONFIG_FILE, owner: 'config', content: after };
  const status = before === undefined ? 'create' : before === after ? 'unchanged' : 'update';
  return [{ op, path: CONFIG_FILE, status, ...(before === undefined ? {} : { before }), after }, ...changes];
}

export interface ApplyOptions extends GlobalOptions {
  dryRun?: boolean;
  diff?: boolean;
  verbose?: boolean;
}

/** Prints the plan, asks for confirmation when interactive, and writes. Returns false if cancelled. */
export async function reviewAndApply(
  ctx: Context,
  changes: PlannedChange[],
  options: ApplyOptions,
): Promise<boolean> {
  printPlan(changes, { verbose: options.verbose ?? false, diff: (options.diff ?? false) || false });
  const pending = changes.filter((c) => c.status === 'create' || c.status === 'update');
  if (options.dryRun || pending.length === 0) return true;
  if (isInteractive(options)) {
    const ok = await p.confirm({ message: `Write ${pending.length} file(s)?`, initialValue: true });
    if (p.isCancel(ok) || !ok) {
      p.cancel('Nothing was written.');
      return false;
    }
  }
  await applyChanges(ctx, changes);
  return true;
}
