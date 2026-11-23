---
name: run-checks
description: Run this repository's lint, type-check, test and build commands and fix failures. Use before finishing any code change, or when asked to verify the project.
---

# Run checks

## Commands

<!-- repo-onboard:begin commands -->
1. `npm run lint`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
<!-- repo-onboard:end commands -->

## Procedure

1. Run the commands in order and stop at the first failure.
2. Read the error, find the root cause and fix it. Never skip, delete or weaken tests to get a pass.
3. Re-run from the failed step until everything passes.
4. Summarise which commands ran and their result.
