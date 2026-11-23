import { mergeOps } from '../core/plan.js';
import type { Context, FileOp, RepoProfile, Target, TargetId } from '../core/types.js';
import { describeTopLevel } from '../detect/index.js';
import { claude } from './claude.js';
import { copilot } from './copilot.js';
import { canonicalOps, docsOps } from './core.js';
import { aider, cline, codex, cursor, gemini, junie, kiro, windsurf } from './tools.js';

export const TARGETS: Record<TargetId, Target> = {
  claude,
  codex,
  copilot,
  gemini,
  cursor,
  windsurf,
  cline,
  junie,
  kiro,
  aider,
};

export function enabledTargets(ctx: Context): Target[] {
  return ctx.config.targets.map((id) => TARGETS[id]);
}

/** Tools whose files are already present in the repo. */
export function detectTargets(profile: RepoProfile): TargetId[] {
  return (Object.keys(TARGETS) as TargetId[]).filter((id) => TARGETS[id].detect(profile));
}

/** Every file operation for the current config, in a stable order. */
async function collectOps(ctx: Context): Promise<FileOp[]> {
  const ops: FileOp[] = [...(await canonicalOps(ctx)), ...(await docsOps(ctx))];
  for (const target of enabledTargets(ctx)) ops.push(...(await target.plan(ctx)));
  return mergeOps(ops);
}

export async function buildOps(ctx: Context): Promise<FileOp[]> {
  // Folders this run will create (e.g. docs/, .github/) belong in the repo map too,
  // otherwise the next sync would report drift.
  const first = await collectOps(ctx);
  const planned = first.map((op) => op.path.split('/')[0]!).filter((_, i) => first[i]!.path.includes('/'));
  const existing = ctx.profile.topLevel.map((t) => t.path);
  const merged = describeTopLevel(
    [...existing, ...planned],
    ctx.config.ignore,
    ctx.profile.workspaces.map((w) => w.dir),
  );
  if (merged.length === ctx.profile.topLevel.length) return first;
  ctx.profile.topLevel = merged;
  return collectOps(ctx);
}
