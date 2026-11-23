import { runChecks } from '../checks/index.js';
import { loadContext } from '../core/context.js';
import type { ContextFile } from '../core/types.js';
import { color, out } from '../report/ui.js';
import { TARGETS } from '../targets/index.js';
import { KIND_LABELS } from '../templates/md.js';
import { describeProfile } from './init.js';
import type { GlobalOptions } from './shared.js';

export interface DoctorOptions extends GlobalOptions {
  json?: boolean;
  all?: boolean;
}

export async function runDoctor(options: DoctorOptions): Promise<number> {
  const { ctx, hasConfig } = await loadContext(options.cwd ? { cwd: options.cwd } : {});
  const ids = options.all ? (Object.keys(TARGETS) as (keyof typeof TARGETS)[]) : ctx.config.targets;
  const map: Record<
    string,
    { label: string; enabled: boolean; docs: string; verified: string; files: ContextFile[] }
  > = {};
  for (const id of ids) {
    const target = TARGETS[id];
    map[id] = {
      label: target.label,
      enabled: ctx.config.targets.includes(id),
      docs: target.docs,
      verified: target.verified,
      files: await target.contextMap(ctx),
    };
  }
  const result = await runChecks(ctx, { hasConfig });
  const count = (s: string) => result.findings.filter((f) => f.severity === s).length;

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          profile: ctx.profile,
          config: ctx.config,
          contextMap: map,
          scores: result.scores,
          summary: { errors: count('error'), warnings: count('warning'), infos: count('info') },
        },
        null,
        2,
      ),
    );
    return 0;
  }

  out.heading('Repository');
  describeProfile(ctx);
  if (ctx.profile.commands.length) {
    out.heading('Detected commands');
    for (const c of ctx.profile.commands)
      out.log(
        `  ${(KIND_LABELS[c.kind] + (c.scope ? ` (${c.scope})` : '')).padEnd(26)} ${c.run} ${color('gray', `← ${c.source}`)}`,
      );
  }

  out.heading('What each tool loads in this repo');
  for (const [id, entry] of Object.entries(map)) {
    const score = result.scores.find((s) => s.target === id)?.score;
    const header = `${entry.label}${entry.enabled ? '' : color('gray', ' (not enabled)')}${score !== undefined ? color('gray', `  readiness ${score}`) : ''}`;
    out.log(`\n  ${color('bold', header)}`);
    for (const file of entry.files) {
      const mark = file.present ? color('green', '✔') : color('gray', '·');
      out.log(`    ${mark} ${file.path.padEnd(44)} ${color('gray', file.role)}`);
    }
    out.log(color('gray', `    docs: ${entry.docs} (verified ${entry.verified})`));
  }

  out.heading('Precedence notes');
  out.log('  • AGENTS.md is the shared source. Codex, Copilot, Cursor and most agents read it natively;');
  out.log(
    '    Claude Code reads it through the @AGENTS.md import in CLAUDE.md; Gemini CLI via context.fileName.',
  );
  out.log('  • The closest AGENTS.md to the file being edited wins (nested files override the root).');
  out.log(
    '  • Copilot applies .github/instructions/*.instructions.md first, then copilot-instructions.md, then AGENTS.md.',
  );

  out.log('');
  out.info(
    `check: ${count('error')} error(s), ${count('warning')} warning(s). Run \`npx repo-onboard check\` for details.`,
  );
  return 0;
}
