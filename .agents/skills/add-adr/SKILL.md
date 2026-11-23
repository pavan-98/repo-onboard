---
name: add-adr
description: Record a significant architecture or technology decision as an ADR. Use when a change adds a dependency, pattern, service or trade-off that future contributors should understand.
---

# Add an architecture decision record

1. Create the file: `npx repo-onboard add adr "<short decision title>"`. It is numbered automatically in `docs/adr/`.
2. Fill in the context, the options you considered (at least two), the decision and its consequences. Be concrete.
3. If it replaces an earlier decision, set the old record's status to `superseded by NNNN`.
4. Mention the ADR in the pull request description.
