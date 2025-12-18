import path from 'path';
import { TEMPLATES } from './templates.js';

export interface FileTask {
  path: string;
  content?: string;
  description: string;
}

export function getExpectedFiles(config: { docsDir: string; generateAI: boolean }): FileTask[] {
  const tasks: FileTask[] = [
    { path: 'CONTRIBUTING.md', content: TEMPLATES.contributing, description: 'Contributing Guide' },
    { path: path.join(config.docsDir, 'ONBOARDING.md'), content: TEMPLATES.onboarding, description: 'Onboarding Guide' },
    { path: path.join(config.docsDir, 'ARCHITECTURE.md'), content: TEMPLATES.architecture, description: 'Architecture Documentation' },
    { path: path.join(config.docsDir, 'DECISIONS.md'), content: TEMPLATES.decisions, description: 'Decision Log (ADRs)' },
    { path: 'README.md', description: 'Project README' }, // Content is conditional, so maybe specific logic elsewhere
  ];

  if (config.generateAI) {
    const aiDir = '.ai';
    tasks.push(
        { path: path.join(aiDir, '_base.md'), content: TEMPLATES.aiBase, description: 'AI Base Context' },
        { path: path.join(aiDir, 'chatgpt.md'), content: TEMPLATES.aiTool('ChatGPT'), description: 'ChatGPT Instructions' },
        { path: path.join(aiDir, 'copilot.md'), content: TEMPLATES.aiTool('GitHub Copilot'), description: 'Copilot Instructions' },
        { path: path.join(aiDir, 'gemini.md'), content: TEMPLATES.aiTool('Gemini'), description: 'Gemini Instructions' },
        { path: path.join(aiDir, 'claude.md'), content: TEMPLATES.aiTool('Claude'), description: 'Claude Instructions' }
    );
  }

  return tasks;
}
