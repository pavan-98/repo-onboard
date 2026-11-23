import { rm } from 'node:fs/promises';
import path from 'node:path';
import { loadContext } from '../core/context.js';
import { exists, listDir, readText, writeText } from '../core/fs.js';
import { out } from '../report/ui.js';
import { customLines, V1_AI_FILES } from '../templates/v1.js';
import { type ApplyOptions, planAll, reviewAndApply } from './shared.js';

export interface MigrateOptions extends ApplyOptions {
  keep?: boolean;
  today?: string;
}

/** Where content from each v1 `.ai/*.md` file goes. */
const DESTINATIONS: Record<string, { file: string; heading: string }> = {
  '_base.md': { file: 'AGENTS.md', heading: 'Notes migrated from .ai/_base.md' },
  'chatgpt.md': { file: 'AGENTS.md', heading: 'Notes migrated from .ai/chatgpt.md' },
  'claude.md': { file: 'CLAUDE.md', heading: 'Notes migrated from .ai/claude.md' },
  'copilot.md': { file: '.github/copilot-instructions.md', heading: 'Notes migrated from .ai/copilot.md' },
  'gemini.md': { file: 'GEMINI.md', heading: 'Notes migrated from .ai/gemini.md' },
};

export async function runMigrate(options: MigrateOptions): Promise<number> {
  const { ctx } = await loadContext({
    ...(options.cwd ? { cwd: options.cwd } : {}),
    adopt: true,
    ...(options.today ? { today: options.today } : {}),
  });
  const aiDir = path.join(ctx.root, '.ai');
  if (!(await exists(aiDir))) {
    out.ok('No v1 .ai/ folder found; nothing to migrate. Run `npx repo-onboard init` to set up.');
    return 0;
  }

  // 1. Collect content a human added to the v1 files.
  const notes = new Map<string, string[]>();
  const unknownFiles: string[] = [];
  for (const file of await listDir(aiDir)) {
    const text = (await readText(path.join(aiDir, file))) ?? '';
    const template = V1_AI_FILES[file];
    const dest = DESTINATIONS[file];
    if (!dest || template === undefined) {
      unknownFiles.push(file);
      const lines = text.trim() ? [`### From .ai/${file}`, '', text.trim()] : [];
      if (lines.length) notes.set('AGENTS.md', [...(notes.get('AGENTS.md') ?? []), ...lines, '']);
      continue;
    }
    const custom = customLines(text, template);
    if (custom.length === 0) continue;
    notes.set(dest.file, [...(notes.get(dest.file) ?? []), `## ${dest.heading}`, '', ...custom, '']);
  }
  if (notes.has('GEMINI.md') && !ctx.config.targets.includes('gemini')) ctx.config.targets.push('gemini');

  out.heading('repo-onboard migrate');
  out.log(
    '  1. Generate AGENTS.md, adapters and docs (v1 placeholder docs are replaced; edited ones are kept).',
  );
  for (const [file, lines] of notes)
    out.log(`  2. Append ${lines.filter((l) => l.startsWith('#')).length} migrated section(s) to ${file}`);
  if (notes.size === 0) out.log('  2. The .ai/ files contain only v1 placeholders; nothing to carry over.');
  out.log(options.keep ? '  3. Keep .ai/ (--keep).' : '  3. Delete .ai/ (no AI tool reads it).');
  out.log('');

  // 2. Generate the v2 layout (including the config file).
  const changes = await planAll(ctx, true);
  if (options.dryRun) {
    await reviewAndApply(ctx, changes, options);
    out.info('Dry run: nothing was written.');
    return 0;
  }
  const ok = await reviewAndApply(ctx, changes, options);
  if (!ok) return 1;

  // 3. Append migrated notes outside managed blocks.
  for (const [file, lines] of notes) {
    const target = path.join(ctx.root, file);
    const current =
      (await readText(target)) ??
      (file === 'GEMINI.md' ? '# Gemini CLI\n\nShared instructions live in AGENTS.md.\n' : '');
    await writeText(target, `${current.trimEnd()}\n\n${lines.join('\n').trimEnd()}\n`);
    out.ok(`Moved notes into ${file}`);
  }

  if (!options.keep) {
    await rm(aiDir, { recursive: true, force: true });
    out.ok('Removed .ai/');
  }
  if (unknownFiles.length)
    out.warn(`Copied unrecognised .ai/ files into AGENTS.md: ${unknownFiles.join(', ')}`);
  out.info('Review the result with `git diff`, then run `npx repo-onboard check`.');
  return 0;
}
