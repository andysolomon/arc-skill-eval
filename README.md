# arc-skill-eval

Pi-native library and CLI that runs [Anthropic-standard skill evals](https://platform.claude.com/docs/en/agents-and-tools/agent-skills) — `evals/evals.json` inside a skill directory, executed with the skill attached, graded with LLM-judged + script-based assertions.

## What it does
Given a skill that ships `SKILL.md` and a sibling `evals/evals.json`, `arc-skill-eval`:

1. discovers every `SKILL.md` + `evals/evals.json` pair under a repo.
2. materializes each case's optional `files/` into a temp workspace.
3. runs the case through the Pi SDK with the skill attached.
4. grades the outputs — string assertions via an LLM-judge, `file-exists` / `regex-match` / `json-valid` via deterministic scripts.
5. writes per-case `outputs/` + `timing.json` + `grading.json` under `<skill>/evals-runs/<runId>/`.
6. optionally compares each case against a no-skill baseline with `--compare`.

Assertion grading follows the guidance in [Anthropic's eval-skills methodology](https://platform.claude.com/docs/en/agents-and-tools/agent-skills) and the inspiration from [OpenAI's eval-skills blog post](https://developers.openai.com/blog/eval-skills).

## Input format
`<skill-dir>/evals/evals.json`:
```json
{
  "skill_name": "arc-conventional-commits",
  "evals": [
    {
      "id": 1,
      "prompt": "Set up semantic-release in this repo.",
      "expected_output": "semantic-release configured with the Conventional Commits preset.",
      "files": ["files/clean-repo"],
      "assertions": [
        { "type": "file-exists", "path": ".releaserc.json" },
        { "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } },
        "The response summarizes the semantic-release plugins it installed."
      ]
    }
  ]
}
```

## Requirements
- Node.js ≥ 20
- Pi installed and configured with at least one provider API key (Anthropic, OpenAI, Google/Gemini, Mistral, xAI, etc.). The skill's assistant runs via `@mariozechner/pi-coding-agent`.

## Install

### From a local checkout
```bash
npm install
npm run build
npm link
arc-skill-eval --help
```

### From a published package
```bash
npm install --global arc-skill-eval
arc-skill-eval --help
```

## Usage

```bash
# Run every eval in every discovered skill under the current repo
arc-skill-eval run .

# Run one skill
arc-skill-eval run ./skills/arc-conventional-commits

# Run one case inside one skill
arc-skill-eval run ./skills/arc-conventional-commits --case 1

# Retarget output to a different workspace root
arc-skill-eval run . --output-dir ./evals-runs

# Machine-readable JSON
arc-skill-eval run . --json

# Opt into with_skill vs without_skill comparison
arc-skill-eval run . --compare

# Group artifacts under an iteration bucket
arc-skill-eval run . --iteration 1
```

The positional `<skill-dir-or-repo>` is resolved as:
- a skill directory if it contains `evals/evals.json`,
- otherwise a repo whose tree is walked for SKILL.md + evals/evals.json pairs.

Exit code: `0` when every case has no failing assertions, `1` otherwise.

## Output layout

For each default single-variant run:

```
<skillDir>/evals-runs/<runId>/
├── eval-<case-id>/
│   ├── outputs/              # files produced by the run
│   ├── timing.json           # { total_tokens, duration_ms }
│   └── grading.json          # per-assertion passed + evidence
```

Use `--iteration <name>` to group artifacts under `<skillDir>/evals-runs/iteration-<name>/<runId>/`; for example `--iteration 1` writes to `iteration-1/<runId>/`.

With `--compare`, each case writes isolated variant artifacts and the skill run root includes `benchmark.json`:

```
<skillDir>/evals-runs/<runId>/
├── benchmark.json            # with_skill vs without_skill aggregate
├── eval-<case-id>/
│   ├── with_skill/
│   │   ├── outputs/
│   │   ├── timing.json
│   │   └── grading.json
│   └── without_skill/
│       ├── outputs/
│       ├── timing.json
│       └── grading.json
```

`grading.json` per the Anthropic format:

```json
{
  "case_id": "1",
  "assertion_results": [
    { "text": "file-exists: .releaserc.json", "passed": true, "evidence": "Found .releaserc.json (182 bytes)", "assertion": { "type": "file-exists", "path": ".releaserc.json" } },
    { "text": "The response summarizes the semantic-release plugins it installed.", "passed": true, "evidence": "\"installs @semantic-release/commit-analyzer + release-notes-generator\"", "assertion": "The response summarizes the semantic-release plugins it installed." }
  ],
  "summary": { "passed": 2, "failed": 0, "total": 2, "pass_rate": 1.0 }
}
```

## Authoring an eval suite for a skill
Use the bundled **`arc-creating-evals`** skill in `skills/arc-creating-evals/`. It interviews you across Anthropic's four success dimensions (outcome, process, style, efficiency) and emits `evals/evals.json` + fixtures. Install the skill into your agent's skills directory (`.claude/skills/` or the equivalent for your tool) — see `skills/README.md` for the recipe.

## Docs
- `docs/evals-json-pivot.md` — direction, milestone log, and what stays vs what was deprecated.
- `docs/domain-model.md` — runtime + grading entities.

## Deferred, not dropped
The current release is the slim MVP of the pivot to the Anthropic format. Planned follow-ups:
- Cross-iteration benchmark comparison for iterate-and-compare flows.
- Human-review `feedback.json`.

See `docs/evals-json-pivot.md` for the full plan.
