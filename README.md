# arc-skill-eval

Pi-native framework and CLI for evaluating skills that ship adjacent `SKILL.md` and `skill.eval.ts` files.

## Status
Bootstrapping repo foundation, planning artifacts, contract loading/normalization, hermetic fixture materialization, initial Pi SDK runner + session telemetry + canonical trace normalization, deterministic scoring, JSON-first reporting with optional HTML rendering, library-backed CLI commands, and semantic-release automation.

## Core docs
- `docs/skill-evals-v1.md`
- `docs/skill-eval-schema.md`
- `docs/framework-repo-structure.md`
- `docs/domain-model.md`

## Current CLI surface
```bash
arc-skill-eval list <repo-or-path>
arc-skill-eval validate <repo-or-path>
arc-skill-eval test <repo-or-path>
arc-skill-eval test <repo-or-path> --skill arc-planning-work --case routing-explicit-001
```
