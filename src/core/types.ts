export type EcosystemId = 'node' | 'python' | 'go' | 'rust' | 'jvm' | 'dotnet' | 'ruby';

export type CommandKind = 'install' | 'dev' | 'build' | 'test' | 'lint' | 'format' | 'typecheck';

export const COMMAND_KINDS: readonly CommandKind[] = [
  'install',
  'dev',
  'build',
  'test',
  'lint',
  'format',
  'typecheck',
];

export interface Command {
  kind: CommandKind;
  /** The exact shell command, e.g. `pnpm run test`. */
  run: string;
  /** Where the command came from, e.g. `package.json#scripts.test` or `inferred`. */
  source: string;
  /** Label used when several ecosystems provide the same kind, e.g. `Python`. */
  scope?: string;
}

export interface Ecosystem {
  id: EcosystemId;
  /** Runtime / platform, e.g. `Node.js`. */
  label: string;
  /** Primary language, e.g. `TypeScript`. */
  language: string;
  /** Runtime version requirement, e.g. `22` or `>=3.11`. */
  version?: string;
  /** File the version came from, e.g. `.nvmrc`. */
  versionFile?: string;
  packageManager?: string;
  manifest: string;
  tools: string[];
  frameworks: string[];
  commands: Command[];
  /** How to run a single test, with placeholders. */
  singleTest?: string;
  /** Globs that match test files. */
  testGlobs: string[];
}

export interface WorkspacePackage {
  name: string;
  /** Posix path relative to the repo root. */
  dir: string;
  description?: string;
  commands: Command[];
}

export interface TaskRunner {
  tool: 'make' | 'just' | 'task';
  file: string;
  targets: string[];
}

export interface CiInfo {
  provider: string;
  file: string;
  runSteps: string[];
}

export interface TopLevelEntry {
  path: string;
  description?: string;
}

export interface RepoProfile {
  root: string;
  name: string;
  description?: string;
  ecosystems: Ecosystem[];
  /** Root-level commands, task-runner targets first, de-duplicated. */
  commands: Command[];
  workspaces: WorkspacePackage[];
  monorepoTool?: string;
  taskRunner?: TaskRunner;
  ci: CiInfo[];
  containers: { dockerfile: boolean; compose?: string; devcontainer: boolean };
  envExample?: string;
  conventionalCommits: boolean;
  license?: string;
  topLevel: TopLevelEntry[];
  /** Agent / AI configuration files that already exist (posix paths). */
  existing: string[];
}

export type TargetId =
  | 'claude'
  | 'codex'
  | 'copilot'
  | 'gemini'
  | 'cursor'
  | 'windsurf'
  | 'cline'
  | 'junie'
  | 'kiro'
  | 'aider';

export interface McpServer {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface Boundaries {
  always: string[];
  askFirst: string[];
  never: string[];
}

export interface Config {
  $schema?: string;
  version: 2;
  name?: string;
  targets: TargetId[];
  docs: { enabled: boolean; dir: string };
  skills: string[];
  nested: boolean;
  boundaries: Boundaries;
  mcpServers: Record<string, McpServer>;
  ignore: string[];
}

export interface Context {
  root: string;
  profile: RepoProfile;
  config: Config;
  /** Allow appending/prepending managed blocks to existing files without markers. */
  adopt: boolean;
  /** ISO date (YYYY-MM-DD) used for newly created dated files. */
  today: string;
}

/** A JSON/TOML/YAML edit. Paths are key arrays. */
export type DataEdit =
  | { op: 'set'; path: string[]; value: unknown }
  | { op: 'default'; path: string[]; value: unknown }
  | { op: 'union'; path: string[]; values: string[] };

export type FileOp =
  | {
      kind: 'managed';
      path: string;
      owner: string;
      /** Full content used when the file does not exist; managed blocks are read from it. */
      initial: string;
      /** Blocks that must always exist; inserted at the top when missing. */
      ensureTop?: string[];
      /** How to add blocks to an existing file that has no markers, when adopting. */
      adopt?: 'prepend' | 'append';
      /** Content that, if found verbatim, may be replaced entirely (old templates). */
      replaceable?: string[];
    }
  | { kind: 'create'; path: string; owner: string; content: string; replaceable?: string[] }
  | { kind: 'generated'; path: string; owner: string; content: string }
  | {
      kind: 'data';
      path: string;
      owner: string;
      format: 'json' | 'toml' | 'yaml';
      edits: DataEdit[];
      /** Leading comment for newly created YAML/TOML files. */
      header?: string;
    };

export type ChangeStatus = 'create' | 'update' | 'unchanged' | 'skip';

export interface PlannedChange {
  op: FileOp;
  path: string;
  status: ChangeStatus;
  before?: string;
  after?: string;
  reason?: string;
}

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  message: string;
  file?: string;
  line?: number;
  target?: string;
  fix?: string;
}

export interface ContextFile {
  path: string;
  role: string;
  present: boolean;
}

export interface Target {
  id: string;
  label: string;
  /** Short description shown in prompts. */
  description: string;
  /** Official documentation the adapter was written against. */
  docs: string;
  /** Month the adapter was last verified against the docs. */
  verified: string;
  /** Whether usage of this tool is visible in the repo. */
  detect(profile: RepoProfile): boolean;
  plan(ctx: Context): Promise<FileOp[]>;
  /** What the tool loads from this repo, for `doctor`. */
  contextMap(ctx: Context): Promise<ContextFile[]>;
  check?(ctx: Context): Promise<Finding[]>;
}
