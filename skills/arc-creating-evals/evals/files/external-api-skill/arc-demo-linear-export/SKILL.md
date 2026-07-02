---
name: arc-demo-linear-export
description: >
  Creates Linear issues from a local planning document. Use when the user asks to turn a plan into Linear issues, bulk-create Linear work items, or sync roadmap tasks into Linear. Requires a Linear API token for live issue creation.
---

# ARC Demo Linear Export

Turns `planning/plan.md` into Linear issues.

## Workflow

1. Read `planning/plan.md`.
2. Ask for the Linear team key if it is not provided.
3. Check whether `LINEAR_API_KEY` is available before any live API call.
4. Draft issue titles and descriptions locally.
5. Ask for confirmation before creating issues in Linear.
6. If credentials or confirmation are missing, write `linear-issues-draft.md` instead of calling the API.

## Safety rules

- Never invent credentials.
- Never create live issues without explicit confirmation.
- Default evals should be offline; live smoke tests must be tagged and opt-in.
