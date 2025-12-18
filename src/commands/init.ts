import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { TEMPLATES } from '../utils/templates.js';
import { getExpectedFiles } from '../utils/files.js';

export const initCommand = new Command('init')
  .description('Initialize onboarding artifacts')
  .option('-d, --docs-dir <dir>', 'Directory for human docs')
  .option('--generate-ai', 'Generate AI reference files')
  .option('--no-generate-ai', 'Do not generate AI reference files')
  .option('-y, --yes', 'Skip prompts and use defaults/flags')
  .action(async (options) => {
    console.log(chalk.bold.blue('Welcome to Repo Onboard!'));

    let config = {
        docsDir: 'docs',
        generateAI: true
    };

    if (options.yes) {
        config.docsDir = options.docsDir || 'docs';
        // If --no-generate-ai is passed, options.generateAi is false. 
        // If --generate-ai is passed, options.generateAi is true.
        // If neither, undefined. Default to true.
        config.generateAI = options.generateAi !== false;
    } else {
        const answers = await inquirer.prompt([
            {
                type: 'input',
                name: 'docsDir',
                message: 'Where should human docs be placed?',
                default: options.docsDir || 'docs'
            },
            {
                type: 'confirm',
                name: 'generateAI',
                message: 'Do you want to generate AI reference files?',
                default: options.generateAi !== false
            }
        ]);
        config = answers;
    }

    console.log(chalk.green('Configuration captured:'));
    console.log(JSON.stringify(config, null, 2));

    await generateFiles(config);
  });

async function generateFiles(config: { docsDir: string; generateAI: boolean }) {
  const tasks = getExpectedFiles(config);

  const readmeTask = tasks.find(t => t.path === 'README.md');
  if (readmeTask && !(await fs.pathExists('README.md'))) {
      readmeTask.content = TEMPLATES.readme;
  }

  console.log(chalk.blue(`\nGenerating files...\n`));

  for (const task of tasks) {
    if (!task.content) continue;

    const filePath = task.path;
    const exists = await fs.pathExists(filePath);
    
    if (exists) {
        console.log(chalk.yellow(`[SKIP] ${filePath} already exists.`));
        continue;
    }

    try {
        await fs.ensureDir(path.dirname(filePath));
        await fs.writeFile(filePath, task.content);
        console.log(chalk.green(`[CREATE] ${filePath}`));
    } catch (error) {
        console.error(chalk.red(`[ERROR] Failed to create ${filePath}: ${error}`));
    }
  }

  console.log(chalk.bold.green('\nOnboarding initialization complete! 🚀'));
}
