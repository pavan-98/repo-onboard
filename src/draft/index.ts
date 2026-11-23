import path from 'node:path';
import spawn from 'cross-spawn';
import { readText } from '../core/fs.js';
import { TODO_RE } from '../core/managed.js';
import type { Context, PlannedChange } from '../core/types.js';

export const DRAFT_AGENTS = ['claude', 'codex', 'gemini', 'copilot'] as const;
export type DraftAgent = (typeof DRAFT_AGENTS)[number];

/**
 * Non-interactive invocations of each agent CLI (verified 2026-11). The prompt is the last argument.
 * The agents are asked to read the repository and print JSON; they are not asked to edit files.
 */
const INVOCATIONS: Record<DraftAgent, (prompt: string) => [string, string[]]> = {
  claude: (p) => ['claude', ['-p', p, '--output-format', 'text']],
  codex: (p) => ['codex', ['exec', '--sandbox', 'read-only', p]],
  gemini: (p) => ['gemini', ['-p', p]],
  copilot: (p) => ['copilot', ['-p', p]],
};

export interface Placeholder {
  file: string;
  key: string;
  line: string;
  hint: string;
}

export async function findPlaceholders(ctx: Context, files: string[]): Promise<Placeholder[]> {
  const found: Placeholder[] = [];
  for (const file of files) {
    const text = await readText(path.join(ctx.root, file));
    if (!text) continue;
    for (const match of text.matchAll(TODO_RE)) {
      const hint = /TODO\(repo-onboard:[\w-]+\):\s*(.*?)_?$/.exec(match[0])?.[1] ?? '';
      found.push({ file, key: match[1]!, line: match[0], hint });
    }
  }
  return found;
}

export function buildPrompt(ctx: Context, placeholders: Placeholder[]): string {
  const facts = {
    name: ctx.profile.name,
    description: ctx.profile.description,
    stack: ctx.profile.ecosystems.map((e) => ({
      language: e.language,
      runtime: e.label,
      frameworks: e.frameworks,
      tools: e.tools,
    })),
    commands: ctx.profile.commands.map((c) => `${c.kind}: ${c.run}`),
    folders: ctx.profile.topLevel.map((t) => t.path),
    workspaces: ctx.profile.workspaces.map((w) => `${w.dir} (${w.name})`),
  };
  const wanted = placeholders.map((p) => `- "${p.file}#${p.key}": ${p.hint}`).join('\n');
  return `You are helping document the software repository in the current working directory.
Read the code (read-only; do NOT modify, create or delete any files) and write accurate, specific content for each placeholder below.

Detected facts:
${JSON.stringify(facts, null, 2)}

Placeholders (key: what to write):
${wanted}

Rules:
- Base every statement on the code you read. If you cannot tell, say what is unknown instead of guessing.
- Markdown only, no headings, 2–8 sentences or a short bullet list per placeholder.
- Respond with ONLY a JSON object mapping each key exactly as given (e.g. "AGENTS.md#overview") to its markdown string.`;
}

export function parseDraft(output: string): Record<string, string> {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(output)?.[1];
  const candidate = fenced ?? output;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The agent did not return a JSON object.');
  const parsed = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed))
    if (typeof value === 'string' && value.trim()) result[key] = value.trim();
  return result;
}

export function runAgent(
  ctx: Context,
  prompt: string,
  options: { agent?: DraftAgent; command?: string; timeoutMs: number },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    if (options.command) {
      // Custom command: prompt is passed on stdin.
      child = spawn(options.command, { cwd: ctx.root, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
      child.stdin?.end(prompt);
    } else {
      const [bin, args] = INVOCATIONS[options.agent!](prompt);
      child = spawn(bin, args, { cwd: ctx.root, stdio: ['ignore', 'pipe', 'pipe'] });
    }
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`The agent did not finish within ${Math.round(options.timeoutMs / 1000)}s.`));
    }, options.timeoutMs);
    child.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        error.code === 'ENOENT'
          ? new Error(
              `Could not run "${options.agent ?? options.command}". Is it installed and on your PATH?`,
            )
          : error,
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`The agent exited with code ${code}.\n${stderr.trim().slice(-2000)}`));
    });
  });
}

/** Replaces placeholder lines with drafted content; returns planned changes for review. */
export async function applyDraft(
  ctx: Context,
  placeholders: Placeholder[],
  draft: Record<string, string>,
): Promise<PlannedChange[]> {
  const byFile = new Map<string, Placeholder[]>();
  for (const p of placeholders) byFile.set(p.file, [...(byFile.get(p.file) ?? []), p]);
  const changes: PlannedChange[] = [];
  for (const [file, list] of byFile) {
    const before = (await readText(path.join(ctx.root, file))) ?? '';
    let after = before;
    for (const p of list) {
      const content = draft[`${p.file}#${p.key}`];
      if (!content) continue;
      // Keep a list-item prefix if the placeholder was a bullet.
      const bullet = /^(\s*[-*]\s+)/.exec(p.line)?.[1];
      after = after.replace(p.line, bullet ? `${bullet}${content.replace(/^[-*]\s+/, '')}` : content);
    }
    if (after !== before)
      changes.push({
        op: { kind: 'create', path: file, owner: 'draft', content: after },
        path: file,
        status: 'update',
        before,
        after,
      });
  }
  return changes;
}
