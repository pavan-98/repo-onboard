/**
 * Programmatic API. The CLI (`repo-onboard`) is a thin wrapper around these functions.
 */
export { type CheckResult, runChecks } from './checks/index.js';
export { main } from './cli.js';
export { runCheck } from './commands/check.js';
export { runInit } from './commands/init.js';
export { runSync } from './commands/sync.js';
export { ALL_TARGETS, CONFIG_FILE, DEFAULT_TARGETS, defaultConfig, normalizeConfig } from './core/config.js';
export { loadContext } from './core/context.js';
export { applyChanges, planChanges } from './core/plan.js';
export type * from './core/types.js';
export { detect } from './detect/index.js';
export { buildOps, TARGETS } from './targets/index.js';
export { VERSION } from './version.js';
