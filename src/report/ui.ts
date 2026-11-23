import { styleText } from 'node:util';
import { createTwoFilesPatch } from 'diff';
import type { PlannedChange } from '../core/types.js';

type Style = Parameters<typeof styleText>[0];

export function color(style: Style, text: string): string {
  return styleText(style, text, { stream: process.stdout });
}

export const out = {
  log: (text = '') => console.log(text),
  info: (text: string) => console.log(`${color('cyan', 'ℹ')} ${text}`),
  ok: (text: string) => console.log(`${color('green', '✔')} ${text}`),
  warn: (text: string) => console.log(`${color('yellow', '⚠')} ${text}`),
  error: (text: string) => console.error(`${color('red', '✖')} ${text}`),
  heading: (text: string) => console.log(`\n${color('bold', text)}`),
};

const STATUS: Record<PlannedChange['status'], [Style, string]> = {
  create: ['green', '+ create   '],
  update: ['yellow', '~ update   '],
  unchanged: ['gray', '= unchanged'],
  skip: ['magenta', '- skip     '],
};

export function printPlan(
  changes: PlannedChange[],
  options: { verbose?: boolean; diff?: boolean } = {},
): void {
  for (const change of changes) {
    if (change.status === 'unchanged' && !options.verbose) continue;
    const [style, label] = STATUS[change.status];
    const reason = change.reason ? color('gray', ` (${change.reason})`) : '';
    out.log(`  ${color(style, label)} ${change.path}${reason}`);
    if (options.diff && (change.status === 'create' || change.status === 'update')) {
      const patch = createTwoFilesPatch(
        `a/${change.path}`,
        `b/${change.path}`,
        change.before ?? '',
        change.after ?? '',
        undefined,
        undefined,
        { context: 2 },
      );
      for (const line of patch.split('\n').slice(2)) {
        if (line.startsWith('+')) out.log(`      ${color('green', line)}`);
        else if (line.startsWith('-')) out.log(`      ${color('red', line)}`);
        else if (line.startsWith('@@')) out.log(`      ${color('cyan', line)}`);
        else if (line) out.log(`      ${color('gray', line)}`);
      }
    }
  }
  const count = (s: PlannedChange['status']) => changes.filter((c) => c.status === s).length;
  out.log(
    color(
      'gray',
      `  ${count('create')} to create, ${count('update')} to update, ${count('unchanged')} unchanged, ${count('skip')} skipped`,
    ),
  );
}
