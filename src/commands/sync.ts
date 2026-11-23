import { CONFIG_FILE } from '../core/config.js';
import { loadContext } from '../core/context.js';
import { out } from '../report/ui.js';
import { type ApplyOptions, planAll, reviewAndApply } from './shared.js';

export interface SyncOptions extends ApplyOptions {
  check?: boolean;
  adopt?: boolean;
  today?: string;
}

export async function runSync(options: SyncOptions): Promise<number> {
  const { ctx, hasConfig } = await loadContext({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    adopt: options.adopt ?? false,
    ...(options.today ? { today: options.today } : {}),
  });
  if (!hasConfig) {
    out.error(`${CONFIG_FILE} not found. Run \`npx repo-onboard init\` first.`);
    return 1;
  }
  const changes = await planAll(ctx, false);
  const pending = changes.filter((c) => c.status === 'create' || c.status === 'update');

  if (options.check) {
    out.heading('repo-onboard sync --check');
    for (const c of pending) out.log(`  ${c.status === 'create' ? 'missing' : 'outdated'}  ${c.path}`);
    if (pending.length) {
      out.error(`${pending.length} file(s) are out of date. Run \`npx repo-onboard sync\`.`);
      return 1;
    }
    out.ok('Everything is in sync.');
    return 0;
  }

  out.heading('repo-onboard sync');
  const ok = await reviewAndApply(ctx, changes, options);
  if (!ok) return 1;
  if (options.dryRun) out.info('Dry run: nothing was written.');
  else if (pending.length) out.ok(`Updated ${pending.length} file(s).`);
  else out.ok('Everything is already in sync.');
  return 0;
}
