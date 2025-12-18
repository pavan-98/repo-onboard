# Repo Onboard - Human & AI Onboarding Standardizer

**Repo Onboard** is a CLI tool designed to standardize repository onboarding for both human contributors and AI agents. It generates essential documentation and reference files to ensure clarity and consistency across your project.

## Features

- **Standardize Documentation**: Generates `CONTRIBUTING.md`, `ARCHITECTURE.md`, `DECISIONS.md`, and more.
- **AI-Ready**: Creates dedicated context files for AI tools like ChatGPT, GitHub Copilot, Gemini, and Claude.
- **Audit Tool**: Checks your repository for missing onboarding artifacts.
- **Configurable**: Choose where your docs live.

## Installation

You can run this tool directly using `npx`:

```bash
npx repo-onboard init
```

Or install it globally:

```bash
npm install -g repo-onboard
```

## Usage

### Initialization (`init`)

To set up onboarding artifacts in your repository:

```bash
npx repo-onboard init
```

Follow the interactive prompts to configure:
1. **Documentation Directory**: Where to store human-readable docs (default: `docs/`).
2. **AI References**: Whether to generate `.ai/` context files.

**Non-Interactive Mode:**
For CI/CD or scripts:
```bash
npx repo-onboard init --docs-dir mydocs --generate-ai -y
```

### Auditing (`audit`)

To check if your repository has all the standard artifacts:

```bash
npx repo-onboard audit
```

This command will list missing files and exit with an error code if artifacts are missing (useful for CI checks).

## Generated Files

### Human Docs
- `CONTRIBUTING.md`
- `docs/ONBOARDING.md`
- `docs/ARCHITECTURE.md`
- `docs/DECISIONS.md`
- `README.md` (if missing)

### AI Context (`.ai/`)
- `_base.md`: Shared context and rules.
- `chatgpt.md`: Instructions for ChatGPT.
- `copilot.md`: Instructions for GitHub Copilot.
- `gemini.md`: Instructions for Gemini.
- `claude.md`: Instructions for Claude.

## Development

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the project:
   ```bash
   npm run build
   ```
4. Run locally:
   ```bash
   ./bin/repo-onboard.js --help
   ```

## License

MIT
