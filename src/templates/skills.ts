import { block } from '../core/managed.js';
import type { Context } from '../core/types.js';
import { code, docsPath, verifyCommands } from './md.js';

export interface SkillTemplate {
  name: string;
  description: string;
  render(ctx: Context): string;
}

function yamlString(value: string): string {
  return /^[\w][\w .,()'/-]*$/.test(value) ? value : JSON.stringify(value);
}

function frontmatter(name: string, description: string): string {
  return `---\nname: ${name}\ndescription: ${yamlString(description)}\n---\n`;
}

export const SKILL_TEMPLATES: Record<string, SkillTemplate> = {
  'run-checks': {
    name: 'run-checks',
    description:
      "Run this repository's lint, type-check, test and build commands and fix failures. Use before finishing any code change, or when asked to verify the project.",
    render(ctx) {
      const verify = verifyCommands(ctx.profile);
      const steps = verify.length
        ? verify.map((c, i) => `${i + 1}. ${code(c.run)}`).join('\n')
        : 'No check commands were detected. Look for them in the manifest or task runner and ask the user.';
      return `${frontmatter(this.name, this.description)}
# Run checks

## Commands

${block('commands', steps)}

## Procedure

1. Run the commands in order and stop at the first failure.
2. Read the error, find the root cause and fix it. Never skip, delete or weaken tests to get a pass.
3. Re-run from the failed step until everything passes.
4. Summarise which commands ran and their result.
`;
    },
  },

  'add-adr': {
    name: 'add-adr',
    description:
      'Record a significant architecture or technology decision as an ADR. Use when a change adds a dependency, pattern, service or trade-off that future contributors should understand.',
    render(ctx) {
      return `${frontmatter(this.name, this.description)}
# Add an architecture decision record

1. Create the file: \`npx repo-onboard add adr "<short decision title>"\`. It is numbered automatically in \`${docsPath(ctx, 'adr/')}\`.
2. Fill in the context, the options you considered (at least two), the decision and its consequences. Be concrete.
3. If it replaces an earlier decision, set the old record's status to \`superseded by NNNN\`.
4. Mention the ADR in the pull request description.
`;
    },
  },

  'repo-onboard': {
    name: 'repo-onboard',
    description:
      'Keep AGENTS.md, CLAUDE.md, Copilot and Gemini config, skills and onboarding docs accurate. Use after changing build or test commands or project structure, or when asked to update agent instructions or onboarding docs.',
    render() {
      return `${frontmatter(this.name, this.description)}
# Maintain onboarding and agent instructions

This repository uses [repo-onboard](https://www.npmjs.com/package/repo-onboard). \`AGENTS.md\` is the single source of
truth; tool-specific files only point to it.

1. Run \`npx repo-onboard check\` and read the findings.
2. Change settings (targets, boundaries, MCP servers, skills) in \`repo-onboard.config.json\`.
3. Run \`npx repo-onboard sync\` to regenerate managed sections and adapters. Never edit text between
   \`<!-- repo-onboard:begin … -->\` and \`<!-- repo-onboard:end … -->\` by hand.
4. Replace any \`TODO(repo-onboard:…)\` placeholders with accurate content, based on reading the code.
   Keep \`AGENTS.md\` short and specific: commands, conventions and boundaries, not general advice.
5. Run \`npx repo-onboard check\` again; it must report no errors.
`;
    },
  },
};

export function customSkill(name: string, description: string): string {
  return `${frontmatter(name, description)}
# ${name}

<!-- Step-by-step instructions the agent should follow. Keep it specific to this repository. -->

1.
`;
}
