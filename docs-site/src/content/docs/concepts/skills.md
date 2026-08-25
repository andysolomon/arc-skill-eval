---
title: Skills
description: How Skeval finds skills and represents their purpose, capabilities, policy, environment, and inference metadata.
sidebar:
  order: 1
---

A skill in Skeval is a directory with `SKILL.md` in the [agentskills.io](https://agentskills.io) format and `evals/evals.json` in the [Anthropic skill-eval format](https://platform.claude.com/docs/en/agents-and-tools/agent-skills). `SKILL.md` defines the behavior. `evals.json` defines the cases and assertions that check it.

```text
<skill-dir>/
├── SKILL.md                    # agentskills.io format
└── evals/
    ├── evals.json              # Anthropic skill-eval format
    └── files/<fixture-name>/   # optional per-case input fixtures
```

## Discovery

`arc-skill-eval` walks a repository and returns each `(SKILL.md, evals/evals.json)` pair. It respects `.gitignore`-style exclusions and skips dot-prefixed directories unless `includeDotDirs` is set. Each `DiscoveredEvalSkill` record points to a skill directory and its case file.

Two implications:

1. The runner ignores a skill without `evals/evals.json`.
2. Multiple skills can coexist in one repo. Pointing the CLI at the repo root runs them all; pointing at a single skill directory runs only that one.

## Skill domain types

The framework represents five separate dimensions instead of combining them in one `profile` enum:

- `SkillCategory` and `SkillClassification` describe the skill's primary and secondary purposes and classification confidence.
- `SkillCapabilities` records actions such as `readsRepo`, `writesRepo`, `usesGit`, external API access, orchestration, planning, and validation.
- `SkillPolicy` records the thinking level, enforcement mode, and target tier.
- `EnvironmentRequirements` records workspace, Git, network, tool, and environment-variable requirements.
- `InferenceMetadata` records the source, confidence, and rationale for inferred values.

`SkillDefinition<EvalSuiteT>` combines the descriptor, source path, and optional eval suite. `PROFILE_VALUES` and `SkillProfile` remain as deprecated compatibility aliases.

## Pipeline

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

The pipeline uses `discover.ts`, `loader.ts`, `run-case.ts`, and `grade.ts` under `src/evals/`, plus the workspace materializer under `src/fixtures/`. `src/cli/run-evals-command.ts` runs the sequence and writes artifacts.
