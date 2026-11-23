import { runChecks } from '../checks/index.js';
import { loadContext } from '../core/context.js';
import { type Format, report } from '../report/format.js';
import { out } from '../report/ui.js';
import type { GlobalOptions } from './shared.js';

export interface CheckOptions extends GlobalOptions {
  format?: string;
  strict?: boolean;
  verbose?: boolean;
}

const FORMATS: Format[] = ['text', 'json', 'github', 'sarif'];

export async function runCheck(options: CheckOptions): Promise<number> {
  const format = (options.format ?? 'text') as Format;
  if (!FORMATS.includes(format)) {
    out.error(`Unknown format "${options.format}". Use one of: ${FORMATS.join(', ')}.`);
    return 2;
  }
  const { ctx, hasConfig } = await loadContext(options.cwd ? { cwd: options.cwd } : {});
  if (format === 'text' || format === 'github') out.heading(`repo-onboard check — ${ctx.profile.name}`);
  const result = await runChecks(ctx, { hasConfig });
  await report(result, format, options.verbose ?? false);
  const errors = result.findings.some((f) => f.severity === 'error');
  const warnings = result.findings.some((f) => f.severity === 'warning');
  return errors || (options.strict && warnings) ? 1 : 0;
}
