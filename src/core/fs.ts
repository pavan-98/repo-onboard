import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

export async function isDir(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isDirectory();
  } catch {
    return false;
  }
}

/** Reads a UTF-8 file with LF line endings, or `undefined` if it does not exist. */
export async function readText(file: string): Promise<string | undefined> {
  try {
    return normalizeEol(await readFile(file, 'utf8'));
  } catch {
    return undefined;
  }
}

/** Reads JSON or JSONC; returns `undefined` when missing or unparseable. */
export async function readJson<T = Record<string, unknown>>(file: string): Promise<T | undefined> {
  const text = await readText(file);
  if (text === undefined) return undefined;
  try {
    return parseJsonc(text, [], { allowTrailingComma: true }) as T;
  } catch {
    return undefined;
  }
}

/** Writes text, creating parent folders, preserving CRLF if the existing file used it. */
export async function writeText(file: string, content: string): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  let out = content;
  try {
    const previous = await readFile(file, 'utf8');
    if (previous.includes('\r\n')) out = content.replace(/\r?\n/g, '\r\n');
  } catch {
    // new file
  }
  await writeFile(file, out, 'utf8');
}

export async function listDir(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

/** First existing file among candidates (relative to root), as a posix path. */
export async function firstExisting(root: string, candidates: string[]): Promise<string | undefined> {
  for (const candidate of candidates) {
    if (await exists(path.join(root, candidate))) return candidate;
  }
  return undefined;
}

/** Relative posix path from the folder containing `from` to `to` (both repo-relative). */
export function relLink(from: string, to: string): string {
  const rel = path.posix.relative(path.posix.dirname(from), to);
  return rel === '' ? path.posix.basename(to) : rel;
}
