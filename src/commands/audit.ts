import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs-extra';
import { getExpectedFiles } from '../utils/files.js';

export const auditCommand = new Command('audit')
  .description('Audit existing artifacts')
  .option('--docs-dir <dir>', 'Directory for documentation', 'docs')
  .action(async (options) => {
    console.log(chalk.bold.yellow('Auditing onboarding artifacts...'));

    // We assume AI files should exist if we are auditing for full compliance
    // Or we could ask/detect? For v1, let's assume standard set + AI.
    
    // Check if .ai directory exists to infer intent?
    // Or just audit all recommended files.
    
    const config = {
        docsDir: options.docsDir,
        generateAI: true // Audit for AI files by default or we can check simple
    };

    const expectedFiles = getExpectedFiles(config);
    let missingCount = 0;

    console.log(chalk.gray(`Checking ${expectedFiles.length} standard artifacts...\n`));

    for (const file of expectedFiles) {
        const exists = await fs.pathExists(file.path);
        if (exists) {
            console.log(chalk.green(`[OK] ${file.path}`));
        } else {
            console.log(chalk.red(`[MISSING] ${file.path}`));
            missingCount++;
        }
    }

    console.log('\n---');
    if (missingCount === 0) {
        console.log(chalk.bold.green('All systems nominal. Great job! 🌟'));
    } else {
        console.log(chalk.bold.red(`Found ${missingCount} missing artifacts.`));
        console.log(chalk.yellow('Run `npx repo-onboard init` to generate them.'));
        process.exitCode = 1;
    }
  });
