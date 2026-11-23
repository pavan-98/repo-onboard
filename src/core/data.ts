import { applyEdits, modify, parse as parseJsonc } from 'jsonc-parser';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { parseDocument } from 'yaml';
import type { DataEdit } from './types.js';

type Obj = Record<string, unknown>;

function getIn(obj: unknown, path: string[]): unknown {
  let current = obj;
  for (const key of path) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Obj)[key];
  }
  return current;
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Computes the value a single edit wants at its path, or `undefined` for "no change". */
function resolveEdit(current: unknown, edit: DataEdit): { changed: boolean; value: unknown } {
  const existing = getIn(current, edit.path);
  switch (edit.op) {
    case 'set':
      return { changed: !deepEqual(existing, edit.value), value: edit.value };
    case 'default':
      return { changed: existing === undefined, value: edit.value };
    case 'union': {
      const list = Array.isArray(existing)
        ? existing.map(String)
        : typeof existing === 'string'
          ? [existing]
          : [];
      const missing = edit.values.filter((v) => !list.includes(v));
      if (missing.length === 0 && Array.isArray(existing)) return { changed: false, value: existing };
      return { changed: true, value: [...list, ...missing] };
    }
  }
}

/** Applies edits to JSON/JSONC text, preserving comments and formatting. */
export function applyJsonEdits(text: string | undefined, edits: DataEdit[]): string {
  let out = text && text.trim() !== '' ? text : '{}\n';
  for (const edit of edits) {
    const current = parseJsonc(out, [], { allowTrailingComma: true });
    const { changed, value } = resolveEdit(current, edit);
    if (!changed) continue;
    const textEdits = modify(out, edit.path, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: '\n' },
    });
    out = applyEdits(out, textEdits);
  }
  if (!out.endsWith('\n')) out += '\n';
  return out;
}

function setIn(obj: Obj, path: string[], value: unknown): void {
  let current = obj;
  for (const key of path.slice(0, -1)) {
    const next = current[key];
    if (next === null || typeof next !== 'object' || Array.isArray(next)) current[key] = {};
    current = current[key] as Obj;
  }
  current[path[path.length - 1]!] = value;
}

/** Applies edits to TOML text. Comments in the existing file are not preserved. */
export function applyTomlEdits(text: string | undefined, edits: DataEdit[], header?: string): string {
  const data = (text ? parseToml(text) : {}) as Obj;
  let changed = text === undefined;
  for (const edit of edits) {
    const result = resolveEdit(data, edit);
    if (!result.changed) continue;
    setIn(data, edit.path, result.value);
    changed = true;
  }
  if (!changed && text !== undefined) return text;
  const body = `${stringifyToml(data).trim()}\n`;
  return header && text === undefined ? `${header}\n${body}` : body;
}

/** Applies edits to YAML text, preserving comments. */
export function applyYamlEdits(text: string | undefined, edits: DataEdit[], header?: string): string {
  const doc = parseDocument(text ?? '');
  if (doc.contents === null) doc.contents = doc.createNode({}) as never;
  let changed = text === undefined;
  for (const edit of edits) {
    const result = resolveEdit(doc.toJS(), edit);
    if (!result.changed) continue;
    doc.setIn(edit.path, doc.createNode(result.value));
    changed = true;
  }
  if (!changed && text !== undefined) return text;
  const body = doc.toString();
  return header && text === undefined ? `${header}\n${body}` : body;
}
