import path from 'node:path';
import { parse as parseToml } from 'smol-toml';
import { exists, firstExisting, isDir, listDir, readJson, readText } from '../core/fs.js';
import type { Command, Ecosystem } from '../core/types.js';

export interface SimpleDetection {
  ecosystem: Ecosystem;
  name?: string;
  description?: string;
}

export async function detectGo(root: string): Promise<SimpleDetection | undefined> {
  const gomod = await readText(path.join(root, 'go.mod'));
  if (!gomod) return undefined;
  const module = /^module\s+(\S+)/m.exec(gomod)?.[1];
  const version = /^go\s+(\S+)/m.exec(gomod)?.[1];
  const golangci = await firstExisting(root, [
    '.golangci.yml',
    '.golangci.yaml',
    '.golangci.toml',
    '.golangci.json',
  ]);
  const commands: Command[] = [
    { kind: 'install', run: 'go mod download', source: 'go.mod' },
    { kind: 'build', run: 'go build ./...', source: 'go.mod' },
    { kind: 'test', run: 'go test ./...', source: 'go.mod' },
    golangci
      ? { kind: 'lint', run: 'golangci-lint run', source: golangci }
      : { kind: 'lint', run: 'go vet ./...', source: 'go.mod' },
    { kind: 'format', run: 'gofmt -w .', source: 'go.mod' },
  ];
  return {
    ecosystem: {
      id: 'go',
      label: 'Go',
      language: 'Go',
      ...(version ? { version, versionFile: 'go.mod' } : {}),
      packageManager: 'go modules',
      manifest: 'go.mod',
      tools: golangci ? ['golangci-lint'] : [],
      frameworks: [],
      commands,
      singleTest: 'go test ./<path/to/pkg> -run <TestName>',
      testGlobs: ['**/*_test.go'],
    },
    ...(module ? { name: module.split('/').pop()! } : {}),
  };
}

export async function detectRust(root: string): Promise<SimpleDetection | undefined> {
  const text = await readText(path.join(root, 'Cargo.toml'));
  if (!text) return undefined;
  let cargo: Record<string, any> = {};
  try {
    cargo = parseToml(text) as Record<string, any>;
  } catch {
    cargo = {};
  }
  const workspace = cargo.workspace !== undefined;
  const ws = workspace ? ' --workspace' : '';
  let version: string | undefined;
  let versionFile: string | undefined;
  const toolchainToml = await readText(path.join(root, 'rust-toolchain.toml'));
  const toolchainPlain = (await readText(path.join(root, 'rust-toolchain')))?.trim();
  if (toolchainToml) {
    try {
      version = String((parseToml(toolchainToml) as any).toolchain?.channel ?? '');
      versionFile = 'rust-toolchain.toml';
    } catch {
      // ignore
    }
  } else if (toolchainPlain) {
    version = toolchainPlain;
    versionFile = 'rust-toolchain';
  } else if (cargo.package?.['rust-version']) {
    version = String(cargo.package['rust-version']);
    versionFile = 'Cargo.toml';
  }
  return {
    ecosystem: {
      id: 'rust',
      label: 'Rust',
      language: 'Rust',
      ...(version ? { version } : {}),
      ...(versionFile ? { versionFile } : {}),
      packageManager: 'cargo',
      manifest: 'Cargo.toml',
      tools: ['Clippy', 'rustfmt'],
      frameworks: [],
      commands: [
        { kind: 'install', run: 'cargo fetch', source: 'Cargo.toml' },
        { kind: 'build', run: `cargo build${ws}`, source: 'Cargo.toml' },
        { kind: 'test', run: `cargo test${ws}`, source: 'Cargo.toml' },
        { kind: 'lint', run: `cargo clippy${ws} --all-targets -- -D warnings`, source: 'Cargo.toml' },
        { kind: 'format', run: 'cargo fmt --all', source: 'Cargo.toml' },
      ],
      singleTest: 'cargo test <test_name>',
      testGlobs: ['tests/**/*.rs', '**/tests/**/*.rs'],
    },
    ...(cargo.package?.name ? { name: String(cargo.package.name) } : {}),
    ...(cargo.package?.description ? { description: String(cargo.package.description) } : {}),
  };
}

export async function detectJvm(root: string): Promise<SimpleDetection | undefined> {
  const gradleFile = await firstExisting(root, [
    'build.gradle.kts',
    'build.gradle',
    'settings.gradle.kts',
    'settings.gradle',
  ]);
  const pom = await exists(path.join(root, 'pom.xml'));
  if (!gradleFile && !pom) return undefined;

  const kotlin =
    (await isDir(path.join(root, 'src/main/kotlin'))) ||
    (await isDir(path.join(root, 'app/src/main/kotlin')));
  const buildText = gradleFile
    ? `${(await readText(path.join(root, gradleFile))) ?? ''}${(await readText(path.join(root, 'build.gradle.kts'))) ?? ''}`
    : ((await readText(path.join(root, 'pom.xml'))) ?? '');

  const frameworks: string[] = [];
  if (/spring-boot|org\.springframework\.boot/.test(buildText)) frameworks.push('Spring Boot');
  if (/quarkus/.test(buildText)) frameworks.push('Quarkus');
  if (/micronaut/.test(buildText)) frameworks.push('Micronaut');
  if (/com\.android\.(application|library)/.test(buildText)) frameworks.push('Android');

  let version = (await readText(path.join(root, '.java-version')))?.trim();
  let versionFile = version ? '.java-version' : undefined;
  if (!version) {
    const match =
      /JavaLanguageVersion\.of\((\d+)\)/.exec(buildText) ??
      /<maven\.compiler\.release>(\d+)</.exec(buildText) ??
      /<java\.version>(\d+)</.exec(buildText);
    if (match) {
      version = match[1];
      versionFile = gradleFile ?? 'pom.xml';
    }
  }

  const commands: Command[] = [];
  const tools: string[] = [];
  let singleTest: string;
  let manifest: string;
  let packageManager: string;
  if (gradleFile) {
    const g = (await exists(path.join(root, 'gradlew'))) ? './gradlew' : 'gradle';
    manifest = gradleFile;
    packageManager = 'Gradle';
    commands.push(
      { kind: 'build', run: `${g} build`, source: gradleFile },
      { kind: 'test', run: `${g} test`, source: gradleFile },
    );
    if (/spotless/.test(buildText)) {
      tools.push('Spotless');
      commands.push(
        { kind: 'lint', run: `${g} spotlessCheck`, source: gradleFile },
        { kind: 'format', run: `${g} spotlessApply`, source: gradleFile },
      );
    } else if (/detekt/.test(buildText)) {
      tools.push('detekt');
      commands.push({ kind: 'lint', run: `${g} detekt`, source: gradleFile });
    } else if (/ktlint/.test(buildText)) {
      tools.push('ktlint');
      commands.push({ kind: 'lint', run: `${g} ktlintCheck`, source: gradleFile });
    }
    singleTest = `${g} test --tests '<fully.qualified.TestClass>'`;
  } else {
    const m = (await exists(path.join(root, 'mvnw'))) ? './mvnw' : 'mvn';
    manifest = 'pom.xml';
    packageManager = 'Maven';
    commands.push(
      { kind: 'install', run: `${m} -B -DskipTests install`, source: 'pom.xml' },
      { kind: 'build', run: `${m} -B package`, source: 'pom.xml' },
      { kind: 'test', run: `${m} -B test`, source: 'pom.xml' },
    );
    if (/spotless/.test(buildText)) {
      tools.push('Spotless');
      commands.push(
        { kind: 'lint', run: `${m} spotless:check`, source: 'pom.xml' },
        { kind: 'format', run: `${m} spotless:apply`, source: 'pom.xml' },
      );
    }
    singleTest = `${m} test -Dtest=<TestClass>#<method>`;
  }

  return {
    ecosystem: {
      id: 'jvm',
      label: 'JVM',
      language: kotlin ? 'Kotlin' : 'Java',
      ...(version ? { version } : {}),
      ...(versionFile ? { versionFile } : {}),
      packageManager,
      manifest,
      tools,
      frameworks,
      commands,
      singleTest,
      testGlobs: ['**/src/test/**'],
    },
  };
}

export async function detectDotnet(root: string): Promise<SimpleDetection | undefined> {
  const entries = await listDir(root);
  let project =
    entries.find((e) => /\.(sln|slnx)$/.test(e)) ?? entries.find((e) => /\.(cs|fs|vb)proj$/.test(e));
  if (!project) {
    for (const dir of ['src', 'source']) {
      const nested = (await listDir(path.join(root, dir))).find((e) => /\.(sln|slnx)$/.test(e));
      if (nested) project = `${dir}/${nested}`;
    }
  }
  if (!project) return undefined;
  const fsharp = entries.some((e) => e.endsWith('.fsproj'));
  const globalJson = await readJson<{ sdk?: { version?: string } }>(path.join(root, 'global.json'));
  const version = globalJson?.sdk?.version;
  return {
    ecosystem: {
      id: 'dotnet',
      label: '.NET',
      language: fsharp ? 'F#' : 'C#',
      ...(version ? { version, versionFile: 'global.json' } : {}),
      packageManager: 'NuGet',
      manifest: project,
      tools: [],
      frameworks: [],
      commands: [
        { kind: 'install', run: 'dotnet restore', source: project },
        { kind: 'build', run: 'dotnet build', source: project },
        { kind: 'test', run: 'dotnet test', source: project },
        { kind: 'lint', run: 'dotnet format --verify-no-changes', source: project },
        { kind: 'format', run: 'dotnet format', source: project },
      ],
      singleTest: 'dotnet test --filter "FullyQualifiedName~<TestName>"',
      testGlobs: ['**/*Tests/**/*.cs', '**/*.Tests/**/*.cs'],
    },
    name: path.basename(project).replace(/\.\w+$/, ''),
  };
}

export async function detectRuby(root: string): Promise<SimpleDetection | undefined> {
  const gemfile = await readText(path.join(root, 'Gemfile'));
  if (!gemfile) return undefined;
  const rails = await exists(path.join(root, 'config/application.rb'));
  const rspec = /['"]rspec/.test(gemfile) || (await isDir(path.join(root, 'spec')));
  const rubocop = /['"]rubocop/.test(gemfile) || (await exists(path.join(root, '.rubocop.yml')));
  const version = (await readText(path.join(root, '.ruby-version')))?.trim();
  const commands: Command[] = [{ kind: 'install', run: 'bundle install', source: 'Gemfile' }];
  if (rails) {
    const binDev = await exists(path.join(root, 'bin/dev'));
    commands.push({ kind: 'dev', run: binDev ? 'bin/dev' : 'bin/rails server', source: 'Gemfile' });
  }
  if (rspec) commands.push({ kind: 'test', run: 'bundle exec rspec', source: 'Gemfile' });
  else if (rails) commands.push({ kind: 'test', run: 'bin/rails test', source: 'Gemfile' });
  else commands.push({ kind: 'test', run: 'bundle exec rake test', source: 'Gemfile' });
  if (rubocop) {
    commands.push({ kind: 'lint', run: 'bundle exec rubocop', source: 'Gemfile' });
    commands.push({ kind: 'format', run: 'bundle exec rubocop -a', source: 'Gemfile' });
  }
  return {
    ecosystem: {
      id: 'ruby',
      label: 'Ruby',
      language: 'Ruby',
      ...(version ? { version, versionFile: '.ruby-version' } : {}),
      packageManager: 'Bundler',
      manifest: 'Gemfile',
      tools: [rspec ? 'RSpec' : 'Minitest', ...(rubocop ? ['RuboCop'] : [])],
      frameworks: rails ? ['Rails'] : [],
      commands,
      singleTest: rspec
        ? 'bundle exec rspec <spec/path_spec.rb>:<line>'
        : 'bin/rails test <test/path_test.rb>:<line>',
      testGlobs: rspec ? ['spec/**/*_spec.rb'] : ['test/**/*_test.rb'],
    },
  };
}
