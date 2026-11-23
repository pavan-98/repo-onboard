import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CONFIG_FILE, configExists } from '../core/config.js';
import { exists, listDir, readJson, readText } from '../core/fs.js';
import { TODO_RE } from '../core/managed.js';
import { planChanges } from '../core/plan.js';
import type { Context, Finding, PlannedChange } from '../core/types.js';
import { COPILOT_REVIEW_LIMIT } from '../targets/copilot.js';
import { buildOps, enabledTargets } from '../targets/index.js';
import { CODEX_MAX_BYTES } from '../targets/tools.js';

const AGENTS_WARN_BYTES = 16 * 1024;

/** Markdown files that agents read as context. */
async function contextFiles(ctx: Context, changes: PlannedChange[]): Promise<string[]> {
  const files = new Set<string>();
  for (const change of changes)
    if (change.path.endsWith('.md') && change.op.kind !== 'create') files.add(change.path);
  for (const extra of ['GEMINI.md', 'CLAUDE.local.md'])
    if (await exists(path.join(ctx.root, extra))) files.add(extra);
  for (const dir of ['.agents/skills', '.claude/skills']) {
    for (const entry of await listDir(path.join(ctx.root, dir))) files.add(`${dir}/${entry}/SKILL.md`);
  }
  const result: string[] = [];
  for (const file of [...files].sort()) if (await exists(path.join(ctx.root, file))) result.push(file);
  return result;
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split('\n').length;
}

/** Yields [lineNumber, line] for lines outside fenced code blocks, plus inline code spans. */
function codeSnippets(text: string): { line: number; code: string }[] {
  const out: { line: number; code: string }[] = [];
  let inFence = false;
  text.split('\n').forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) {
      out.push({ line: i + 1, code: line.trim() });
      return;
    }
    for (const match of line.matchAll(/(`+)([^`]+?)\1/g)) out.push({ line: i + 1, code: match[2]!.trim() });
  });
  return out;
}

const PM_BUILTINS = new Set([
  'install',
  'i',
  'ci',
  'add',
  'remove',
  'exec',
  'dlx',
  'x',
  'create',
  'init',
  'update',
  'upgrade',
  'publish',
  'link',
  'why',
  'outdated',
  'workspace',
  'workspaces',
  'audit',
  'version',
  'pack',
  'config',
  'login',
  'cache',
  'rebuild',
  'store',
  'up',
  'info',
  'list',
  'ls',
  'help',
]);

async function checkCommands(ctx: Context, files: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const pkg = await readJson<{ scripts?: Record<string, string> }>(path.join(ctx.root, 'package.json'));
  const scripts = new Set(Object.keys(pkg?.scripts ?? {}));
  const runner = ctx.profile.taskRunner;
  const runnerTargets = new Set(runner?.targets ?? []);

  for (const file of files) {
    const text = (await readText(path.join(ctx.root, file))) ?? '';
    for (const { line, code } of codeSnippets(text)) {
      if (
        code.includes('<') ||
        code.includes('--filter') ||
        code.includes('--workspace') ||
        /\bworkspace\b/.test(code)
      )
        continue;
      const npm = /^(npm|pnpm|yarn|bun)\s+(?:run\s+)?([\w:.-]+)/.exec(code);
      if (npm && pkg) {
        const [, pm, script] = npm;
        const explicitRun = /\srun\s/.test(`${code} `);
        if (!explicitRun && (PM_BUILTINS.has(script!) || (pm === 'bun' && script === 'test'))) continue;
        if (!explicitRun && pm === 'npm' && !['test', 'start', 'stop', 'restart'].includes(script!)) continue;
        if (!scripts.has(script!))
          findings.push({
            rule: 'commands/missing-script',
            severity: 'error',
            file,
            line,
            message: `\`${code}\` refers to script "${script}", which is not in package.json.`,
            fix: 'Update the command, or run `npx repo-onboard sync` if it is in a generated section.',
          });
        continue;
      }
      const task = /^(make|just|task)\s+([\w.-]+)/.exec(code);
      if (
        task &&
        runner &&
        task[1] === runner.tool &&
        !task[2]!.includes('=') &&
        !runnerTargets.has(task[2]!)
      ) {
        findings.push({
          rule: 'commands/missing-target',
          severity: 'error',
          file,
          line,
          message: `\`${code}\` refers to ${runner.tool} target "${task[2]}", which is not in ${runner.file}.`,
        });
      }
    }
  }
  return findings;
}

async function checkLinks(ctx: Context, files: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of files) {
    const text = (await readText(path.join(ctx.root, file))) ?? '';
    const withoutCode = text
      .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '))
      .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
    for (const match of withoutCode.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1]!;
      if (/^([a-z][a-z0-9+.-]*:|#|\/\/)/i.test(href)) continue;
      const target = decodeURIComponent(href.split('#')[0]!.split('?')[0]!);
      if (!target) continue;
      const resolved = path.join(ctx.root, path.dirname(file), target);
      if (!(await exists(resolved)))
        findings.push({
          rule: 'links/broken',
          severity: 'warning',
          file,
          line: lineOf(withoutCode, match.index ?? 0),
          message: `Link target "${href}" does not exist.`,
        });
    }
  }
  return findings;
}

async function checkSizes(ctx: Context, files: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of files) {
    const text = (await readText(path.join(ctx.root, file))) ?? '';
    const bytes = Buffer.byteLength(text, 'utf8');
    if (path.posix.basename(file) === 'AGENTS.md') {
      if (bytes > CODEX_MAX_BYTES)
        findings.push({
          rule: 'size/agents-md',
          severity: 'error',
          target: 'codex',
          file,
          message: `${file} is ${Math.round(bytes / 1024)} KiB; Codex stops reading project docs at 32 KiB.`,
          fix: 'Move details into linked docs or nested AGENTS.md files.',
        });
      else if (bytes > AGENTS_WARN_BYTES)
        findings.push({
          rule: 'size/agents-md',
          severity: 'warning',
          file,
          message: `${file} is ${Math.round(bytes / 1024)} KiB. Keep it short (under 16 KiB): agents follow concise instructions better.`,
        });
    }
    if (file === '.github/copilot-instructions.md' && text.length > COPILOT_REVIEW_LIMIT)
      findings.push({
        rule: 'size/copilot-instructions',
        severity: 'warning',
        target: 'copilot',
        file,
        message: `${file} has ${text.length} characters; Copilot code review only reads the first ${COPILOT_REVIEW_LIMIT}.`,
      });
    if (path.posix.basename(file) === 'CLAUDE.md' && text.split('\n').length > 300)
      findings.push({
        rule: 'size/claude-md',
        severity: 'info',
        target: 'claude',
        file,
        message: `${file} is long; move content shared by all agents into AGENTS.md.`,
      });
  }
  return findings;
}

async function checkFrontmatter(ctx: Context): Promise<Finding[]> {
  const findings: Finding[] = [];
  const parse = (text: string): Record<string, unknown> | undefined | null => {
    const match = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!match) return undefined;
    try {
      return (parseYaml(match[1]!) ?? {}) as Record<string, unknown>;
    } catch {
      return null;
    }
  };
  for (const dir of ['.agents/skills', '.claude/skills']) {
    for (const entry of await listDir(path.join(ctx.root, dir))) {
      const file = `${dir}/${entry}/SKILL.md`;
      const text = await readText(path.join(ctx.root, file));
      if (text === undefined) {
        findings.push({
          rule: 'skills/missing',
          severity: 'error',
          file,
          message: `Skill folder ${dir}/${entry} has no SKILL.md.`,
        });
        continue;
      }
      const fm = parse(text);
      if (!fm) {
        findings.push({
          rule: 'skills/frontmatter',
          severity: 'error',
          file,
          line: 1,
          message: 'SKILL.md needs YAML frontmatter with name and description.',
        });
        continue;
      }
      const name = fm.name;
      const description = fm.description;
      if (typeof name !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64)
        findings.push({
          rule: 'skills/name',
          severity: 'error',
          file,
          line: 2,
          message: 'Skill "name" must be lowercase letters, digits and hyphens (max 64).',
        });
      else if (name !== entry)
        findings.push({
          rule: 'skills/name',
          severity: 'warning',
          file,
          line: 2,
          message: `Skill name "${name}" should match its folder "${entry}".`,
        });
      if (typeof description !== 'string' || description.trim() === '')
        findings.push({
          rule: 'skills/description',
          severity: 'error',
          file,
          message: 'Skill needs a "description" saying what it does and when to use it.',
        });
      else if (description.length > 1024)
        findings.push({
          rule: 'skills/description',
          severity: 'error',
          file,
          message: 'Skill "description" must be at most 1024 characters.',
        });
    }
  }
  for (const skill of ctx.config.skills) {
    if (
      !(await exists(path.join(ctx.root, '.agents/skills', skill, 'SKILL.md'))) &&
      !['repo-onboard', 'run-checks', 'add-adr'].includes(skill)
    )
      findings.push({
        rule: 'skills/missing',
        severity: 'error',
        file: CONFIG_FILE,
        message: `Skill "${skill}" is listed in ${CONFIG_FILE} but .agents/skills/${skill}/SKILL.md does not exist.`,
        fix: `npx repo-onboard add skill ${skill}`,
      });
  }
  for (const entry of await listDir(path.join(ctx.root, '.github/instructions'))) {
    if (!entry.endsWith('.instructions.md')) continue;
    const file = `.github/instructions/${entry}`;
    const fm = parse((await readText(path.join(ctx.root, file))) ?? '');
    if (!fm || typeof fm.applyTo !== 'string')
      findings.push({
        rule: 'copilot/apply-to',
        severity: 'warning',
        target: 'copilot',
        file,
        line: 1,
        message:
          'Path-specific instructions need an `applyTo` glob in their frontmatter, or Copilot never applies them.',
      });
  }
  return findings;
}

const SECRET_PATTERNS: [string, RegExp][] = [
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(proj-)?[A-Za-z0-9]{20,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['private key', /-----BEGIN (RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/],
];

async function checkSecrets(ctx: Context, files: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  const all = [
    ...files,
    CONFIG_FILE,
    '.mcp.json',
    '.vscode/mcp.json',
    '.cursor/mcp.json',
    '.gemini/settings.json',
    '.codex/config.toml',
    '.claude/settings.json',
  ];
  for (const file of all) {
    const text = await readText(path.join(ctx.root, file));
    if (!text) continue;
    for (const [label, re] of SECRET_PATTERNS) {
      const match = re.exec(text);
      if (match)
        findings.push({
          rule: 'secrets',
          severity: 'error',
          file,
          line: lineOf(text, match.index),
          message: `Possible ${label} committed in an agent context file.`,
          fix: 'Remove it, rotate it, and reference an environment variable instead (e.g. "${env:API_KEY}").',
        });
    }
  }
  return findings;
}

async function checkTodos(ctx: Context, files: string[]): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const file of [...files, 'SECURITY.md']) {
    const text = await readText(path.join(ctx.root, file));
    if (!text) continue;
    for (const match of text.matchAll(TODO_RE)) {
      findings.push({
        rule: 'todo',
        severity: 'info',
        file,
        line: lineOf(text, match.index ?? 0),
        message: `Placeholder "${match[1]}" still needs content.`,
        fix: 'Write it yourself, or run `npx repo-onboard draft --with <claude|codex|gemini|copilot>`.',
      });
    }
  }
  return findings;
}

async function checkLegacy(ctx: Context): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (await exists(path.join(ctx.root, '.ai')))
    findings.push({
      rule: 'legacy/v1-ai-dir',
      severity: 'warning',
      file: '.ai',
      message: 'The .ai/ folder from repo-onboard 1.x is not read by any AI tool.',
      fix: 'npx repo-onboard migrate',
    });
  const decisions = path.join(ctx.root, ctx.config.docs.dir, 'DECISIONS.md');
  if (ctx.config.docs.enabled && (await exists(decisions)))
    findings.push({
      rule: 'legacy/decisions-md',
      severity: 'info',
      file: `${ctx.config.docs.dir}/DECISIONS.md`,
      message: `Decisions now live as one file each in ${ctx.config.docs.dir}/adr/. Move entries with \`npx repo-onboard add adr "<title>"\` and delete DECISIONS.md.`,
    });
  return findings;
}

function driftFindings(changes: PlannedChange[]): Finding[] {
  const findings: Finding[] = [];
  for (const change of changes) {
    const target = ['agents', 'docs'].includes(change.op.owner) ? undefined : change.op.owner;
    const base = { file: change.path, ...(target ? { target } : {}) };
    if (change.status === 'create') {
      const optional = change.op.kind === 'create';
      findings.push({
        ...base,
        rule: 'presence',
        severity: optional ? 'warning' : 'error',
        message: `${change.path} is missing.`,
        fix: 'npx repo-onboard sync',
      });
    } else if (change.status === 'update') {
      findings.push({
        ...base,
        rule: 'drift',
        severity: 'error',
        message: `${change.path} is out of date with the repository${change.reason ? ` (${change.reason})` : ''}.`,
        fix: 'npx repo-onboard sync',
      });
    } else if (change.status === 'skip') {
      findings.push({
        ...base,
        rule: 'unmanaged',
        severity: change.path === 'AGENTS.md' ? 'warning' : 'info',
        message: `${change.path} is not managed by repo-onboard: ${change.reason}.`,
      });
    }
  }
  return findings;
}

export interface CheckResult {
  findings: Finding[];
  scores: { target: string; label: string; score: number }[];
  changes: PlannedChange[];
}

export async function runChecks(ctx: Context, options: { hasConfig: boolean }): Promise<CheckResult> {
  const changes = await planChanges(ctx, await buildOps(ctx));
  const files = await contextFiles(ctx, changes);
  const findings: Finding[] = [];

  if (!options.hasConfig && !(await configExists(ctx.root)))
    findings.push({
      rule: 'config',
      severity: 'error',
      file: CONFIG_FILE,
      message: `${CONFIG_FILE} is missing, so repo-onboard has not been set up here.`,
      fix: 'npx repo-onboard init',
    });

  findings.push(
    ...driftFindings(changes),
    ...(await checkCommands(ctx, files)),
    ...(await checkLinks(ctx, files)),
    ...(await checkSizes(ctx, files)),
    ...(await checkFrontmatter(ctx)),
    ...(await checkSecrets(ctx, files)),
    ...(await checkLegacy(ctx)),
    ...(await checkTodos(ctx, files)),
  );
  for (const target of enabledTargets(ctx)) if (target.check) findings.push(...(await target.check(ctx)));

  // Tool readiness: shared files affect every tool.
  const scores = enabledTargets(ctx).map((target) => {
    const relevant = findings.filter((f) => f.target === target.id || f.target === undefined);
    const penalty = relevant.reduce(
      (sum, f) => sum + (f.severity === 'error' ? 25 : f.severity === 'warning' ? 5 : 0),
      0,
    );
    return { target: target.id, label: target.label, score: Math.max(0, 100 - penalty) };
  });

  const order = { error: 0, warning: 1, info: 2 } as const;
  findings.sort(
    (a, b) =>
      order[a.severity] - order[b.severity] ||
      (a.file ?? '').localeCompare(b.file ?? '') ||
      (a.line ?? 0) - (b.line ?? 0),
  );
  return { findings, scores, changes };
}
