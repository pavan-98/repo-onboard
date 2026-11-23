/**
 * Managed blocks: regions of a Markdown file owned by repo-onboard.
 *
 *   <!-- repo-onboard:begin commands -->
 *   ...generated...
 *   <!-- repo-onboard:end commands -->
 *
 * Everything outside the markers belongs to humans and is never modified.
 */

export const GENERATED_MARKER = 'repo-onboard:generated';

const BLOCK_RE = /<!-- repo-onboard:begin ([\w.-]+) -->\n?([\s\S]*?)<!-- repo-onboard:end \1 -->/g;

export function block(id: string, body: string): string {
  return `<!-- repo-onboard:begin ${id} -->\n${body.trim()}\n<!-- repo-onboard:end ${id} -->`;
}

export function extractBlocks(content: string): Map<string, string> {
  const blocks = new Map<string, string>();
  for (const match of content.matchAll(BLOCK_RE)) {
    blocks.set(match[1]!, match[0]);
  }
  return blocks;
}

export function hasBlocks(content: string): boolean {
  return extractBlocks(content).size > 0;
}

/** Replaces blocks found in `content` with the versions in `wanted`; unknown blocks are left alone. */
export function replaceBlocks(content: string, wanted: Map<string, string>): string {
  return content.replace(BLOCK_RE, (whole, id: string) => wanted.get(id) ?? whole);
}

export function prependBlocks(content: string, blocks: string[]): string {
  if (blocks.length === 0) return content;
  return `${blocks.join('\n\n')}\n\n${content.replace(/^\n+/, '')}`;
}

export function appendBlocks(content: string, blocks: string[]): string {
  if (blocks.length === 0) return content;
  return `${content.trimEnd()}\n\n${blocks.join('\n\n')}\n`;
}

/** Line-based TODO placeholders that `--draft-with` or a human should replace. */
export const TODO_RE = /^.*TODO\(repo-onboard:([\w-]+)\).*$/gm;

export function todo(key: string, hint: string): string {
  return `_TODO(repo-onboard:${key}): ${hint}_`;
}
