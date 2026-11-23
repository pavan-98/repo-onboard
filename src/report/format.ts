import { appendFile } from 'node:fs/promises';
import type { CheckResult } from '../checks/index.js';
import type { Finding } from '../core/types.js';
import { VERSION } from '../version.js';
import { color, out } from './ui.js';

export type Format = 'text' | 'json' | 'github' | 'sarif';

const ICON = { error: ['red', '✖'], warning: ['yellow', '⚠'], info: ['cyan', 'ℹ'] } as const;

function location(f: Finding): string {
  return f.file ? `${f.file}${f.line ? `:${f.line}` : ''}` : '';
}

function summary(result: CheckResult) {
  const count = (s: Finding['severity']) => result.findings.filter((f) => f.severity === s).length;
  return { errors: count('error'), warnings: count('warning'), infos: count('info') };
}

function text(result: CheckResult, verbose: boolean): void {
  const shown = result.findings.filter((f) => verbose || f.severity !== 'info');
  for (const f of shown) {
    const [style, icon] = ICON[f.severity];
    out.log(
      `${color(style, icon)} ${color('gray', `[${f.rule}]`)} ${f.message}${location(f) ? color('gray', `  ${location(f)}`) : ''}`,
    );
    if (f.fix) out.log(`    ${color('gray', `fix: ${f.fix}`)}`);
  }
  const hiddenInfo = result.findings.length - shown.length;
  if (result.scores.length) {
    out.heading('Agent readiness');
    for (const s of result.scores) {
      const style = s.score >= 90 ? 'green' : s.score >= 60 ? 'yellow' : 'red';
      const bar = '█'.repeat(Math.round(s.score / 10)).padEnd(10, '░');
      out.log(`  ${s.label.padEnd(16)} ${color(style, bar)} ${String(s.score).padStart(3)}`);
    }
  }
  const { errors, warnings, infos } = summary(result);
  out.log('');
  const line = `${errors} error(s), ${warnings} warning(s), ${infos} note(s)${hiddenInfo ? ` (${hiddenInfo} note(s) hidden; use --verbose)` : ''}`;
  if (errors) out.error(line);
  else if (warnings) out.warn(line);
  else out.ok(`All checks passed. ${line}`);
}

function github(result: CheckResult): string {
  const lines = result.findings.map((f) => {
    const level = f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'notice';
    const props = [
      f.file ? `file=${f.file}` : '',
      f.line ? `line=${f.line}` : '',
      `title=repo-onboard ${f.rule}`,
    ]
      .filter(Boolean)
      .join(',');
    const message = `${f.message}${f.fix ? ` Fix: ${f.fix}` : ''}`
      .replace(/%/g, '%25')
      .replace(/\r/g, '%0D')
      .replace(/\n/g, '%0A');
    return `::${level} ${props}::${message}`;
  });
  return lines.join('\n');
}

function stepSummary(result: CheckResult): string {
  const { errors, warnings, infos } = summary(result);
  const rows = result.scores.map((s) => `| ${s.label} | ${s.score} |`).join('\n');
  const findings = result.findings
    .filter((f) => f.severity !== 'info')
    .map((f) => `| ${f.severity} | \`${f.rule}\` | ${f.message.replace(/\|/g, '\\|')} | ${location(f)} |`)
    .join('\n');
  return `## repo-onboard check

**${errors}** errors · **${warnings}** warnings · **${infos}** notes

| Tool | Readiness |
|---|---|
${rows}
${findings ? `\n| Severity | Rule | Message | Location |\n|---|---|---|---|\n${findings}\n` : ''}`;
}

function sarif(result: CheckResult): object {
  const rules = [...new Set(result.findings.map((f) => f.rule))].sort();
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'repo-onboard',
            version: VERSION,
            informationUri: 'https://github.com/pavan-98/repo-onboard',
            rules: rules.map((id) => ({ id, shortDescription: { text: id } })),
          },
        },
        results: result.findings.map((f) => ({
          ruleId: f.rule,
          level: f.severity === 'info' ? 'note' : f.severity,
          message: { text: `${f.message}${f.fix ? ` Fix: ${f.fix}` : ''}` },
          ...(f.file
            ? {
                locations: [
                  {
                    physicalLocation: {
                      artifactLocation: { uri: f.file },
                      ...(f.line ? { region: { startLine: f.line } } : {}),
                    },
                  },
                ],
              }
            : {}),
        })),
      },
    ],
  };
}

export async function report(result: CheckResult, format: Format, verbose = false): Promise<void> {
  switch (format) {
    case 'json':
      console.log(
        JSON.stringify(
          { version: VERSION, summary: summary(result), scores: result.scores, findings: result.findings },
          null,
          2,
        ),
      );
      return;
    case 'sarif':
      console.log(JSON.stringify(sarif(result), null, 2));
      return;
    case 'github': {
      const annotations = github(result);
      if (annotations) console.log(annotations);
      if (process.env.GITHUB_STEP_SUMMARY)
        await appendFile(process.env.GITHUB_STEP_SUMMARY, stepSummary(result));
      text(result, verbose);
      return;
    }
    default:
      text(result, verbose);
  }
}
