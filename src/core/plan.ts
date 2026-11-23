import path from 'node:path';
import { applyJsonEdits, applyTomlEdits, applyYamlEdits } from './data.js';
import { readText, writeText } from './fs.js';
import {
  appendBlocks,
  extractBlocks,
  GENERATED_MARKER,
  hasBlocks,
  prependBlocks,
  replaceBlocks,
} from './managed.js';
import type { Context, FileOp, PlannedChange } from './types.js';

function sameText(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

/**
 * True when two texts differ only in formatting a Markdown/YAML formatter might apply
 * (whitespace, table alignment, list markers), so formatters like Prettier don't cause drift.
 */
export function formatEquivalent(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .replace(/^(\s*)[*+](\s)/gm, '$1-$2')
      .replace(/:?-{3,}:?/g, '---')
      .replace(/\s+/g, '');
  return norm(a) === norm(b);
}

function isReplaceable(before: string, replaceable: string[] | undefined): boolean {
  return (replaceable ?? []).some((candidate) => sameText(before, candidate));
}

async function planOne(ctx: Context, op: FileOp): Promise<PlannedChange> {
  const before = await readText(path.join(ctx.root, op.path));
  const base = { op, path: op.path, before };

  switch (op.kind) {
    case 'create': {
      if (before === undefined) return { ...base, status: 'create', after: op.content };
      if (isReplaceable(before, op.replaceable))
        return { ...base, status: 'update', after: op.content, reason: 'replacing v1 placeholder' };
      return { ...base, status: 'unchanged', after: before };
    }

    case 'generated': {
      if (before === undefined) return { ...base, status: 'create', after: op.content };
      if (!before.includes(GENERATED_MARKER))
        return { ...base, status: 'skip', after: before, reason: 'file exists and is not generated' };
      return formatEquivalent(before, op.content)
        ? { ...base, status: 'unchanged', after: before }
        : { ...base, status: 'update', after: op.content };
    }

    case 'data': {
      const apply =
        op.format === 'json' ? applyJsonEdits : op.format === 'toml' ? applyTomlEdits : applyYamlEdits;
      let after: string;
      try {
        after = apply(before, op.edits, op.header);
      } catch (error) {
        return {
          ...base,
          status: 'skip',
          after: before,
          reason: `could not parse existing file: ${(error as Error).message}`,
        };
      }
      if (before === undefined) return { ...base, status: 'create', after };
      return after === before
        ? { ...base, status: 'unchanged', after }
        : { ...base, status: 'update', after };
    }

    case 'managed': {
      if (before === undefined) return { ...base, status: 'create', after: op.initial };
      if (isReplaceable(before, op.replaceable))
        return { ...base, status: 'update', after: op.initial, reason: 'replacing v1 placeholder' };

      const wanted = extractBlocks(op.initial);
      let after = before;
      const hadBlocks = hasBlocks(before);

      if (hadBlocks) after = replaceBlocks(after, wanted);

      const present = extractBlocks(after);
      const top = (op.ensureTop ?? []).filter((id) => !present.has(id) && wanted.has(id));
      if (top.length > 0)
        after = prependBlocks(
          after,
          top.map((id) => wanted.get(id)!),
        );

      if (!hadBlocks && op.adopt) {
        const rest = [...wanted.keys()].filter((id) => !(op.ensureTop ?? []).includes(id));
        if (ctx.adopt) {
          const blocks = rest.map((id) => wanted.get(id)!);
          after = op.adopt === 'append' ? appendBlocks(after, blocks) : prependBlocks(after, blocks);
        } else if (top.length === 0) {
          return {
            ...base,
            status: 'skip',
            after: before,
            reason: 'no repo-onboard markers (run `repo-onboard sync --adopt` to add them)',
          };
        }
      } else if (!hadBlocks && top.length === 0) {
        return { ...base, status: 'skip', after: before, reason: 'no repo-onboard markers; left untouched' };
      }

      return formatEquivalent(after, before)
        ? { ...base, status: 'unchanged', after: before }
        : { ...base, status: 'update', after };
    }
  }
}

export async function planChanges(ctx: Context, ops: FileOp[]): Promise<PlannedChange[]> {
  const seen = new Set<string>();
  const changes: PlannedChange[] = [];
  for (const op of ops) {
    if (seen.has(op.path)) continue;
    seen.add(op.path);
    changes.push(await planOne(ctx, op));
  }
  return changes;
}

export async function applyChanges(ctx: Context, changes: PlannedChange[]): Promise<void> {
  for (const change of changes) {
    if ((change.status === 'create' || change.status === 'update') && change.after !== undefined) {
      await writeText(path.join(ctx.root, change.path), change.after);
    }
  }
}

/** Merges several ops that target the same data file into one. */
export function mergeOps(ops: FileOp[]): FileOp[] {
  const out: FileOp[] = [];
  const dataByPath = new Map<string, Extract<FileOp, { kind: 'data' }>>();
  for (const op of ops) {
    if (op.kind === 'data') {
      const existing = dataByPath.get(op.path);
      if (existing) {
        existing.edits.push(...op.edits);
        continue;
      }
      const copy = { ...op, edits: [...op.edits] };
      dataByPath.set(op.path, copy);
      out.push(copy);
    } else {
      out.push(op);
    }
  }
  return out;
}
