import { Command } from 'commander';

import { initCommand } from './commands/init.js';
import { auditCommand } from './commands/audit.js';

const program = new Command();

program
  .name('repo-onboard')
  .description('Human & AI Onboarding Standardizer')
  .version('1.0.0');

program.addCommand(initCommand);
program.addCommand(auditCommand);

program.parse(process.argv);
