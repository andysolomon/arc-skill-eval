# arc-skill-eval

Pi-native library and CLI for running skill evals. Authoring format follows [Anthropic's published `evals/evals.json` standard](https://platform.claude.com/docs/en/agents-and-tools/agent-skills). The eval methodology — layered grading, small starter suites that grow from real failures, the with-skill / without-skill comparison as the load-bearing signal — is directly inspired by OpenAI's [Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills) (Kundel & Chua, Jan 2026). The runtime philosophy ("an LLM, a loop, and enough tokens") borrows from Ampcode's [How to Build an Agent](https://ampcode.com/notes/how-to-build-an-agent) and Mihail Eric's [The Emperor Has No Clothes](https://www.mihaileric.com/The-Emperor-Has-No-Clothes/). See [Inspiration & credits](#inspiration--credits) for the full attribution.

## What it does
Given a skill that ships `SKILL.md` and a sibling `evals/evals.json`, `arc-skill-eval`:

1. discovers every `SKILL.md` + `evals/evals.json` pair under a repo.
2. materializes each case's optional `files/` into a temp workspace.
3. runs the case through the Pi SDK with the skill attached.
4. grades the outputs — string assertions via an LLM-judge, `file-exists` / `regex-match` / `json-valid` via deterministic scripts.
5. writes per-case `assistant.md` + `outputs/` + `timing.json` + `grading.json` + observability artifacts under `<skill>/evals-runs/<runId>/`.
6. tracks model, thinking level, token usage, estimated cost, context-window size, and context percentage used.
7. records tool-call counts, skill reads, external calls, MCP-looking tool calls, and the context/tool manifest exposed to the model.
8. optionally compares each case against a no-skill baseline with `--compare`.

Assertion grading mirrors OpenAI's layered approach (deterministic checks first, model-assisted rubric for prose) and emits artifacts in Anthropic's published [`grading.json`](https://platform.claude.com/docs/en/agents-and-tools/agent-skills) shape.

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

# Add explicit distractor/conflict skills to the model context
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1

# Opt into normal Pi ambient resources such as configured extensions/tools
# while recording the resulting loadout in context-manifest.json
arc-skill-eval run ./skills/arc-conventional-commits \
  --context-mode ambient \
  --iteration ambient-1
```

The positional `<skill-dir-or-repo>` is resolved as:
- a skill directory if it contains `evals/evals.json`,
- otherwise a repo whose tree is walked for SKILL.md + evals/evals.json pairs.

Context options:
- `--extra-skill <path>` can be repeated to add explicit skill directories or `SKILL.md` files as distractor/conflict context. In `--compare`, `with_skill` receives the target + extras, while `without_skill` receives extras only.
- `--context-mode isolated` is the default: no ambient Pi skills, extensions, prompt templates, themes, or context files are loaded.
- `--context-mode ambient` opts into normal Pi ambient resources so extension tools/MCP-like tools and other configured resources can enter the context. The resolved loadout is recorded in `context-manifest.json`.

Exit code: `0` when every case has no failing assertions, `1` otherwise.

## Output layout

For each default single-variant run:

```
<skillDir>/evals-runs/<runId>/
├── eval-<case-id>/
│   ├── assistant.md          # final assistant response text
│   ├── outputs/              # files produced by the run
│   ├── timing.json           # duration, model, thinking, token/cost/context metrics
│   ├── grading.json          # per-assertion passed + evidence
│   ├── trace.json            # normalized runtime trace + raw telemetry refs
│   ├── tool-summary.json     # tool calls, errors, skill reads, external/MCP activity
│   └── context-manifest.json # skills/tools/context exposed to the model
```

Use `--iteration <name>` to group artifacts under `<skillDir>/evals-runs/iteration-<name>/<runId>/`; for example `--iteration 1` writes to `iteration-1/<runId>/`.

With `--compare`, each case writes isolated variant artifacts and the skill run root includes `benchmark.json`:

```
<skillDir>/evals-runs/<runId>/
├── benchmark.json            # with_skill vs without_skill aggregate
├── eval-<case-id>/
│   ├── with_skill/
│   │   ├── assistant.md
│   │   ├── outputs/
│   │   ├── timing.json
│   │   ├── grading.json
│   │   ├── trace.json
│   │   ├── tool-summary.json
│   │   └── context-manifest.json
│   └── without_skill/
│       ├── assistant.md
│       ├── outputs/
│       ├── timing.json
│       ├── grading.json
│       ├── trace.json
│       ├── tool-summary.json
│       └── context-manifest.json
```

`timing.json` includes runner observability:

```json
{
  "total_tokens": 12345,
  "duration_ms": 50123,
  "model": { "provider": "anthropic", "id": "claude-opus-4-5", "thinking": "medium" },
  "thinking_level": "medium",
  "token_usage": {
    "input_tokens": 10000,
    "output_tokens": 2000,
    "cache_read_tokens": 300,
    "cache_write_tokens": 45,
    "total_tokens": 12345
  },
  "estimated_cost_usd": 0.1234,
  "context_window_tokens": 200000,
  "context_window_used_percent": 6.2
}
```

`tool-summary.json` highlights behavior-level observability:

```json
{
  "tool_call_count": 8,
  "tool_error_count": 0,
  "tool_calls_by_name": { "read": 2, "bash": 3, "write": 2, "edit": 1 },
  "skill_read_count": 1,
  "skill_reads_by_name": { "arc-conventional-commits": 1 },
  "external_call_count": 0,
  "mcp_tool_call_count": 0
}
```

`context-manifest.json` records the run loadout so skill/tool conflicts can be diagnosed:

```json
{
  "runtime": "pi",
  "mode": "isolated",
  "attached_skills": [{ "name": "arc-conventional-commits", "path": ".../SKILL.md", "role": "target" }],
  "available_tools": [{ "name": "bash", "source": "builtin" }],
  "active_tools": ["read", "bash", "edit", "write"],
  "mcp_tools": [],
  "mcp_servers": [],
  "ambient": { "extensions": false, "skills": false, "prompt_templates": false, "themes": false, "context_files": false }
}
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

## Inspiration & credits

`arc-skill-eval` exists because three pieces of writing made it clear what to build, in what shape, and with what philosophy. Each one shaped a different layer:

- **The eval methodology** — *every workflow choice in the grader and the suite-growth advice in the docs* — comes from OpenAI's **[Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills)** by Dominik Kundel and Gabriel Chua (January 22, 2026). The framing of an eval as *"a prompt → a captured run (trace + artifacts) → a small set of checks → a score you can compare over time"*, the layered-grading recipe (fast deterministic checks first, then model-assisted rubric), the multi-category success metrics (outcome / process / style / efficiency), and the guidance that *"a small set of 10–20 prompts is enough to surface regressions"* — these are OpenAI's, transposed onto Anthropic's published format.
- **The eval format** — the on-disk `evals/evals.json` shape, the per-case `grading.json`, the aggregate `benchmark.json`, and the `with_skill` / `without_skill` comparison — comes from [Anthropic's documented skill-eval methodology](https://platform.claude.com/docs/en/agents-and-tools/agent-skills). The framework consumes Anthropic's format so a skill author can take their `evals.json` to any compatible runner.
- **The runtime philosophy** — *the bias toward a small, legible runtime that's not afraid to call itself a loop* — owes a debt to two posts that demystified the agentic harness:
  - Thorsten Ball's **[How to Build an Agent](https://ampcode.com/notes/how-to-build-an-agent)** (Ampcode, April 15, 2025) — *"It's an LLM, a loop, and enough tokens"* — and the demonstration that a useful code-editing agent fits in a few hundred lines.
  - Mihail Eric's **[The Emperor Has No Clothes: How to Code Claude Code in 200 Lines of Code](https://www.mihaileric.com/The-Emperor-Has-No-Clothes/)** (January 2026), which makes the same point at the level of agent harnesses: the core is a tool registry, an inner loop, and a parser. *Production complexity is engineering, not architecture.*

If you read only one of those before authoring an eval, read OpenAI's. If you read only one before extending the framework, read either of the harness pieces.
