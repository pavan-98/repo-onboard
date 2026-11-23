import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import { slugify } from '../src/commands/add.js';
import { applyJsonEdits, applyTomlEdits, applyYamlEdits } from '../src/core/data.js';
import { block, extractBlocks, prependBlocks, replaceBlocks } from '../src/core/managed.js';
import { parseDraft } from '../src/draft/index.js';
import { permissionRule } from '../src/targets/claude.js';
import { customLines, V1 } from '../src/templates/v1.js';
import { VERSION } from '../src/version.js';

describe('managed blocks', () => {
  it('replaces only the content between markers', () => {
    const file = `# Title\n\nhuman text\n\n${block('a', 'old')}\n\nmore human text\n`;
    const wanted = extractBlocks(block('a', 'new'));
    const result = replaceBlocks(file, wanted);
    expect(result).toContain('human text');
    expect(result).toContain('more human text');
    expect(result).toContain('new');
    expect(result).not.toContain('old');
  });

  it('leaves unknown blocks alone and can prepend', () => {
    const file = block('mine', 'keep me');
    expect(replaceBlocks(file, extractBlocks(block('other', 'x')))).toBe(file);
    expect(prependBlocks('body\n', [block('top', '@AGENTS.md')])).toMatch(/^<!-- repo-onboard:begin top -->/);
  });
});

describe('data edits', () => {
  it('preserves JSONC comments and unrelated keys', () => {
    const before = '{\n  // my comment\n  "theme": "dark",\n  "context": { "fileName": "GEMINI.md" }\n}\n';
    const after = applyJsonEdits(before, [
      { op: 'union', path: ['context', 'fileName'], values: ['AGENTS.md', 'GEMINI.md'] },
    ]);
    expect(after).toContain('// my comment');
    expect(after).toContain('"theme": "dark"');
    expect(JSON.parse(after.replace(/\/\/.*$/m, '')).context.fileName).toEqual(['GEMINI.md', 'AGENTS.md']);
  });

  it('is a no-op when nothing changes', () => {
    const text = '{\n  "a": [\n    "x"\n  ]\n}\n';
    expect(applyJsonEdits(text, [{ op: 'union', path: ['a'], values: ['x'] }])).toBe(text);
    expect(applyJsonEdits(text, [{ op: 'default', path: ['a'], value: ['y'] }])).toBe(text);
  });

  it('edits TOML and YAML', () => {
    const toml = applyTomlEdits(undefined, [
      { op: 'set', path: ['mcp_servers', 'docs'], value: { command: 'npx', args: ['-y', 'docs'] } },
    ]);
    expect(toml).toContain('[mcp_servers.docs]');
    const yaml = applyYamlEdits('# keep\nmodel: x\n', [
      { op: 'union', path: ['read'], values: ['AGENTS.md'] },
    ]);
    expect(yaml).toContain('# keep');
    expect(yaml).toMatch(/read:\n\s+- AGENTS\.md/);
  });
});

describe('helpers', () => {
  it('builds Claude permission prefixes', () => {
    expect(permissionRule('npm run lint')).toBe('Bash(npm run lint:*)');
    expect(permissionRule('go test ./...')).toBe('Bash(go test:*)');
    expect(permissionRule('cargo clippy --all-targets -- -D warnings')).toBe('Bash(cargo clippy:*)');
  });

  it('slugifies ADR titles', () => {
    expect(slugify('Use PostgreSQL for séssions!')).toBe('use-postgresql-for-sessions');
    expect(slugify('AGENTS.md as the single source of truth with thin per-tool adapters')).toBe(
      'agents-md-as-the-single-source-of-truth-with-thin-per-tool',
    );
  });

  it('finds custom lines in v1 files', () => {
    expect(customLines(V1.aiTool('Claude'), V1.aiTool('Claude'))).toEqual([]);
    expect(customLines(`${V1.aiTool('Claude')}- Prefer pnpm\n`, V1.aiTool('Claude'))).toEqual([
      '- Prefer pnpm',
    ]);
  });

  it('parses agent JSON output, even inside fences or chatter', () => {
    expect(parseDraft('Sure!\n```json\n{"AGENTS.md#overview": "It sells things."}\n```')).toEqual({
      'AGENTS.md#overview': 'It sells things.',
    });
    expect(() => parseDraft('no json here')).toThrow();
  });

  it('reads the version from package.json', () => {
    expect(VERSION).toBe(pkg.version);
  });
});
