---
title: Skills
description: What counts as a skill in Skeval, how it gets discovered, and the domain types that describe what it can do.
sidebar:
  order: 1
---

A **skill** in Skeval is a directory that ships both a `SKILL.md` (the [agentskills.io](https://agentskills.io) format) and a sibling `evals/evals.json` (the [Anthropic skill-eval format](https://platform.claude.com/docs/en/agents-and-tools/agent-skills)). The first declares what the skill *does*; the second declares how to *prove it does that*.

```text
<skill-dir>/
├── SKILL.md                    # agentskills.io format
└── evals/
    ├── evals.json              # Anthropic skill-eval format
    └── files/<fixture-name>/   # optional per-case input fixtures
```

## Discovery

`arc-skill-eval` walks a repo and yields every `(SKILL.md, evals/evals.json)` pair it finds, respecting `.gitignore`-style ignored directories and skipping dot-prefixed dirs unless `includeDotDirs` is set. The result is a list of `DiscoveredEvalSkill` records — each pointing at one skill directory and the case file inside it.

Two implications:

1. A skill *without* `evals/evals.json` is invisible to the runner. That's deliberate: the framework is for evaluating skills that have committed to being evaluable.
2. Multiple skills can coexist in one repo. Pointing the CLI at the repo root runs them all; pointing at a single skill directory runs only that one.

## Skill domain types

New code in the framework distinguishes four orthogonal dimensions of a skill instead of overloading a single `profile` enum:

- **`SkillCategory` / `SkillClassification`** — what the skill is *for*. Primary and secondary categories with confidence.
- **`SkillCapabilities`** — what the skill *can do*. `readsRepo`, `writesRepo`, `usesGit`, external API access, orchestration, planning, validation.
- **`SkillPolicy`** — thinking level, enforcement mode, target tier.
- **`EnvironmentRequirements`** — workspace, git, network, tool, and env-var requirements.
- **`InferenceMetadata`** — source, confidence, and rationale for inferred values, so it's traceable how Skeval came up with a classification.

The aggregate type is `SkillDefinition<EvalSuiteT>`: descriptor + source path + optional eval suite, all in one record. The older `PROFILE_VALUES` and `SkillProfile` aliases remain as deprecated compatibility shims while existing code migrates.

## The pipeline at a glance

```text
<skill-dir>
  ├── SKILL.md
  └── evals/
      ├── evals.json
      └── files/<fixture-name>/…
         ↓ discoverEvalSkills
DiscoveredEvalSkill
         ↓ readEvalsJson
EvalsJsonFile (+ EvalCase[])
         ↓ materialize WorkspaceSetup / legacy files
         ↓ runEvalCase
{ assistantText, workspaceDir, timing, trace }
         ↓ gradeEvalCase
GradingJson ({ assertion_results, summary })
         ↓ write to disk
<skillDir>/evals-runs/<runId>/eval-<id>/{assistant.md, outputs, grading.json, timing.json, trace.json, tool-summary.json, context-manifest.json}
```

Each arrow corresponds to a function in `src/evals/`: `discover.ts`, `loader.ts`, `run-case.ts`, `grade.ts`, plus the workspace materializer in `src/fixtures/`. The CLI handler in `src/cli/run-evals-command.ts` orchestrates them and writes artifacts.
