---
applyTo: "**/*.{test,spec}.{ts,tsx,mts,cts},**/__tests__/**"
---
<!-- repo-onboard:generated: change test commands in your manifest, then run `npx repo-onboard sync` -->

# Tests

- Run the suite with `npm test`.
- Run one test: `npx vitest run <path/to/file.test.ts> -t "<test name>"`
- Cover new behaviour and regressions with tests next to the existing ones; follow their structure and naming.
- Never skip, delete or weaken assertions to make a test pass. Fix the code or ask.
