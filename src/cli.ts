import { Command, Option } from 'commander';
import { addAdr, addMcp, addSkill, addTarget } from './commands/add.js';
import { runCheck } from './commands/check.js';
import { runDoctor } from './commands/doctor.js';
import { runDraft } from './commands/draft.js';
import { runInit } from './commands/init.js';
import { runMigrate } from './commands/migrate.js';
import { runSync } from './commands/sync.js';
import { ConfigError } from './core/config.js';
import { loadContext } from './core/context.js';
import { DRAFT_AGENTS } from './draft/index.js';
import { out } from './report/ui.js';
import { VERSION } from './version.js';

type Opts = Record<string, unknown>;

function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function createProgram(onExit: (code: number) => void): Command {
  const program = new Command();
  const globals = (cmd: Command): Opts => cmd.optsWithGlobals();
  const handle =
    (fn: (opts: Opts, cmd: Command, ...args: unknown[]) => Promise<number>) =>
    async (...raw: unknown[]) => {
      const cmd = raw[raw.length - 1] as Command;
      const args = raw.slice(0, -2);
      onExit(await fn(globals(cmd), cmd, ...args));
    };

  program
    .name('repo-onboard')
    .description(
      'One source of truth for every AI coding agent and every new teammate.\nGenerates AGENTS.md plus Claude, Codex, Copilot and Gemini adapters from your repository, and keeps them in sync.',
    )
    .version(VERSION, '-v, --version')
    .option('-C, --cwd <dir>', 'run as if started in <dir>')
    .option('-y, --yes', 'never prompt; accept defaults (also automatic in CI and non-TTY shells)')
    .showHelpAfterError();

  program
    .command('init')
    .description('detect the repository and generate AGENTS.md, tool adapters, skills and docs')
    .option(
      '-t, --targets <list>',
      'comma-separated tools, or "all" (claude,codex,copilot,gemini,cursor,windsurf,cline,junie,kiro,aider)',
    )
    .option('-d, --docs-dir <dir>', 'folder for human docs (default: docs)')
    .option('--no-docs', 'skip human docs (CONTRIBUTING, ONBOARDING, ARCHITECTURE, ADRs)')
    .option('--no-skills', 'skip the starter Agent Skills')
    .option('--no-adopt', 'do not add generated sections to existing AGENTS.md / copilot-instructions.md')
    .addOption(
      new Option('--draft-with <agent>', 'let an installed agent CLI draft the TODO sections').choices([
        ...DRAFT_AGENTS,
      ]),
    )
    .option('--draft-cmd <command>', 'custom drafting command; receives the prompt on stdin, prints JSON')
    .option('--draft-timeout <seconds>', 'drafting timeout in seconds', (v) => Number(v), 600)
    .option('-n, --dry-run', 'show what would change without writing')
    .option('--diff', 'print a diff for every change')
    .option('--verbose', 'also list unchanged files')
    .action(handle((o) => runInit(o)));

  program
    .command('sync')
    .description('regenerate managed sections and adapters from repo-onboard.config.json and the repository')
    .option('--check', 'exit with code 1 if any file is out of date (no writes)')
    .option('--adopt', 'add generated sections to existing files that have no repo-onboard markers')
    .option('-n, --dry-run', 'show what would change without writing')
    .option('--diff', 'print a diff for every change')
    .option('--verbose', 'also list unchanged files')
    .action(handle((o) => runSync(o)));

  const check = program
    .command('check')
    .alias('audit')
    .description(
      'validate agent context: drift, missing files, stale commands, broken links, size, skills, secrets',
    )
    .addOption(
      new Option('-f, --format <format>', 'output format')
        .choices(['text', 'json', 'github', 'sarif'])
        .default('text'),
    )
    .option('--strict', 'treat warnings as errors')
    .option('--verbose', 'also show notes (placeholders, unmanaged files)')
    .action(handle((o) => runCheck(o)));
  void check;

  program
    .command('doctor')
    .description('show what each AI tool will actually load in this repository')
    .option('--all', 'include tools that are not enabled')
    .option('--json', 'machine-readable output')
    .action(handle((o) => runDoctor(o)));

  program
    .command('draft')
    .description(
      'let your installed agent CLI write the TODO(repo-onboard:…) sections (read-only, you review the diff)',
    )
    .addOption(new Option('-w, --with <agent>', 'agent CLI to use').choices([...DRAFT_AGENTS]))
    .option('--cmd <command>', 'custom command; receives the prompt on stdin and must print JSON')
    .option('--timeout <seconds>', 'timeout in seconds', (v) => Number(v), 600)
    .option('-n, --dry-run', 'show the drafted diff without writing')
    .action(
      handle(async (o) => {
        const { ctx } = await loadContext(o.cwd ? { cwd: o.cwd as string } : {});
        return runDraft(ctx, o);
      }),
    );

  program
    .command('migrate')
    .description('upgrade a repo-onboard 1.x layout (.ai/ folder) to AGENTS.md and native tool files')
    .option('--keep', 'keep the .ai/ folder after migrating')
    .option('-n, --dry-run', 'show what would change without writing')
    .option('--diff', 'print a diff for every change')
    .action(handle((o) => runMigrate(o)));

  const add = program.command('add').description('add a tool, skill, ADR or MCP server');
  add
    .command('target')
    .argument('<ids...>', 'tools to enable, e.g. cursor windsurf')
    .description('enable more AI tools and generate their files')
    .option('-n, --dry-run', 'show what would change without writing')
    .action(handle((o, _cmd, ids) => addTarget(ids as string[], o)));
  add
    .command('skill')
    .argument('<name>', 'skill name (built-in: repo-onboard, run-checks, add-adr)')
    .option('--description <text>', 'what the skill does and when to use it')
    .option('-n, --dry-run', 'show what would change without writing')
    .description('add an Agent Skill in .agents/skills (shared by Codex, Claude, Copilot, Gemini and others)')
    .action(handle((o, _cmd, name) => addSkill(name as string, o)));
  add
    .command('adr')
    .argument('<title...>', 'decision title')
    .option('--status <status>', 'initial status', 'proposed')
    .option('-n, --dry-run', 'show the file that would be created')
    .description('create the next numbered architecture decision record')
    .action(handle((o, _cmd, title) => addAdr((title as string[]).join(' '), o)));
  add
    .command('mcp')
    .argument('<name>', 'server name')
    .argument('<command-or-url>', 'executable for a local server, or https:// URL for a remote one')
    .argument(
      '[args...]',
      'arguments for a local server; put them after -- (e.g. add mcp docs -- npx -y @acme/mcp)',
    )
    .option(
      '-e, --env <KEY=value>',
      'environment variable (repeatable); prefer ${env:VAR} references over secrets',
      collect,
    )
    .option('-H, --header <Name: value>', 'HTTP header for remote servers (repeatable)', collect)
    .option('-n, --dry-run', 'show what would change without writing')
    .description('register an MCP server once and write it to every enabled tool’s config')
    .action(
      handle((o, _cmd, name, commandOrUrl, args) =>
        addMcp(name as string, commandOrUrl as string, (args as string[]) ?? [], o),
      ),
    );

  return program;
}

/** CLI entry point. Sets process.exitCode instead of exiting so it is safe to call from tests. */
export async function main(argv: string[]): Promise<number> {
  let code = 0;
  const program = createProgram((c) => {
    code = c;
  });
  program.exitOverride();
  try {
    await program.parseAsync(argv);
  } catch (error) {
    const err = error as { code?: string; exitCode?: number; message?: string };
    if (err.code?.startsWith('commander.')) {
      code =
        err.code === 'commander.helpDisplayed' || err.code === 'commander.version' ? 0 : (err.exitCode ?? 1);
    } else if (error instanceof ConfigError) {
      out.error(error.message);
      code = 1;
    } else {
      throw error;
    }
  }
  process.exitCode = code;
  return code;
}
