# 1. Record architecture decisions

- Status: accepted
- Date: 2026-11-23

## Context and problem statement

We need to remember why the project is built the way it is, for new teammates and for AI agents
that read the repository.

## Decision

We record significant decisions as Architecture Decision Records using the
[MADR](https://adr.github.io/madr/) format, one numbered file per decision in this folder.
New records are created with `npx repo-onboard add adr "<title>"`.

## Consequences

Decisions and their trade-offs are discoverable in the repository. Superseded decisions are kept and
marked as such instead of being deleted.
