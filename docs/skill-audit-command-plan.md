# Skill Audit Command Plan

Date: 2026-06-30

## Decision

Add a separate `arc-skill-eval audit` command instead of expanding `arc-skill-eval create`.

`create` should continue to mean: scaffold or update `evals/evals.json`.

`audit` should mean: inspect one skill or a skill repo for skill-authoring quality issues using the `writing-great-skills` rubric.

## Why separate commands

- Eval generation and skill-quality review have different outputs.
- `create` writes eval suites; `audit` should produce findings and recommended rewrites.
- Keeping them separate avoids a command that both judges the skill and generates tests for it.
- Audit findings can later feed into `create` by suggesting better trigger/negative/golden-path cases.

## Proposed CLI

```bash
arc-skill-eval audit ./skills/my-skill
arc-skill-eval audit ./skills
arc-skill-eval audit ./skills --json
arc-skill-eval audit ./skills --output skill-audit.md
```

Optional later flags:

```bash
arc-skill-eval audit ./skills --model <provider/model[:thinking]>
arc-skill-eval audit ./skills --fix-plan
arc-skill-eval audit ./skills --fail-on high
```

## Inputs

- Skill directory containing `SKILL.md`
- Repo/directory containing many `*/SKILL.md` files
- Optional existing `evals/evals.json`

## Outputs

Default human-readable markdown:

```markdown
# Skill Audit

## Summary

## Findings

### high: create-skill
- sprawl: SKILL.md has 498 lines
- description: trigger branches duplicate skill authoring synonyms
- information hierarchy: Cursor reference should be disclosed

## Recommended rewrite order
```

JSON mode:

```json
{
  "skills": [
    {
      "name": "create-skill",
      "path": "skills/create-skill/SKILL.md",
      "line_count": 498,
      "findings": [
        {
          "severity": "high",
          "category": "sprawl",
          "message": "SKILL.md is 498 lines; consider progressive disclosure."
        }
      ]
    }
  ]
}
```

## Finding Categories

Use the same language as `writing-great-skills`:

- invocation
- description
- information-hierarchy
- completion-criteria
- leading-words
- duplication
- sediment
- no-op
- sprawl
- eval-coverage

## Phase 1: Deterministic checks

Implement cheap checks first:

1. Parse frontmatter.
2. Record skill name, description, `disable-model-invocation`, and line count.
3. Flag missing `SKILL.md` frontmatter fields.
4. Flag long descriptions.
5. Flag long `SKILL.md` files by threshold:
   - warning: > 200 lines
   - high: > 400 lines
6. Flag user-invoked skills with trigger-heavy descriptions.
7. Flag missing `evals/evals.json`.
8. Flag broken markdown links to local disclosed reference files.
9. Flag near-duplicate skill names and similar bodies.
10. Flag output artifact mentions in `SKILL.md` without matching deterministic assertions in evals.

Completion criterion: `audit` can produce a useful repo-level markdown report without calling an LLM.

## Phase 2: Model-judged rubric checks

Add optional LLM analysis after deterministic checks:

1. Are trigger branches distinct?
2. Does the description over-trigger?
3. Are steps ordered and bounded by completion criteria?
4. Which sections are reference that should be disclosed?
5. Which lines are likely no-ops?
6. Which meanings are duplicated?
7. What is the best next rewrite action?

Completion criterion: model-judged findings cite concrete lines/sections and produce actionable rewrite recommendations.

## Phase 3: Integrate with `create`

Use audit findings to improve eval generation without merging the commands:

- over-trigger findings become adjacent-negative eval suggestions
- artifact findings become deterministic assertion suggestions
- missing completion criteria become process-assertion suggestions
- duplicate skill findings become `--extra-skill` conflict eval suggestions

Completion criterion: `create` can optionally consume an audit JSON file, but remains an eval scaffolder.

## Initial implementation areas

Likely files:

- `src/cli/argv.ts`
- `src/cli/run-cli.ts`
- new `src/cli/audit-command.ts`
- new `src/skill-audit/*`
- tests under `tests/`
- README usage docs

## First acceptance criteria

### Scenario: Audit a single skill

Given a directory with `SKILL.md`
When I run `arc-skill-eval audit ./skills/create-skill`
Then the CLI prints frontmatter, line count, invocation mode, and findings.

### Scenario: Audit a repo

Given a directory containing multiple `SKILL.md` files
When I run `arc-skill-eval audit ./skills`
Then the CLI prints a summary table and per-skill findings.

### Scenario: JSON output

Given any valid audit target
When I run `arc-skill-eval audit ./skills --json`
Then stdout is valid JSON with skill records and findings.

### Scenario: Broken reference link

Given `SKILL.md` links to `MISSING.md`
When I run audit
Then the report includes a local-link finding with the missing path.

### Scenario: Missing eval coverage

Given a skill has no `evals/evals.json`
When I run audit
Then the report includes an `eval-coverage` finding recommending `arc-skill-eval create`.
