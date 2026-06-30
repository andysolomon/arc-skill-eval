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
# Scaffold a starter eval suite next to a SKILL.md
arc-skill-eval create ./skills/my-skill

# Preview the generated evals.json without writing it
arc-skill-eval create ./skills/my-skill --dry-run

# Review a human-readable summary of generated cases/assertions
arc-skill-eval create ./skills/my-skill --dry-run --summary

# Run every eval in every discovered skill under the current repo
arc-skill-eval run .

# Run one skill
arc-skill-eval run ./skills/arc-conventional-commits

# Run one case inside one skill
arc-skill-eval run ./skills/arc-conventional-commits --case 1

# Pin the skill runner model and LLM-judge model
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-5.5:medium \
  --judge-model mistral/ministral-8b-latest

# Create a tiny eval-owned Pi config/runtime directory
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b

# Use an eval-owned Pi config/runtime directory
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b

# Generate a static HTML review report from run artifacts
arc-skill-eval review ./skills/hello-world/evals-runs/<runId>

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

### Recommended first dogfood run

The companion [`andysolomon/arc-skills`](https://github.com/andysolomon/arc-skills) repo ships a dogfood suite for `arc-creating-evals`, the meta-skill that authors eval suites for other skills. After cloning both repos locally, this is the best end-to-end smoke test:

```bash
arc-skill-eval run /path/to/arc-skills/arc-creating-evals \
  --case execution-golden-path-file-skill \
  --model openai-codex/gpt-5.5:medium \
  --judge-model openai-codex/gpt-5.5:medium
```

For the with-skill / without-skill signal:

```bash
arc-skill-eval run /path/to/arc-skills/arc-creating-evals \
  --case execution-golden-path-file-skill \
  --compare \
  --iteration dogfood-1 \
  --model openai-codex/gpt-5.5:medium \
  --judge-model openai-codex/gpt-5.5:medium
```

A recent dogfood run passed the golden-path case and showed a positive `+16.7%` with-skill delta after tightening the suite to assert behavior unique to `arc-creating-evals`.

### Create starter evals

Generate a valid starter suite for a skill directory:

```bash
arc-skill-eval create ./skills/my-skill
```

The command reads `SKILL.md` frontmatter, writes `evals/evals.json`, and includes three starter cases:

- `trigger-explicit`
- `execution-golden-path`
- `adjacent-negative`

When obvious output artifacts are mentioned in `SKILL.md`, such as `plan.md` or `report.json`, the execution case also gets deterministic `file-exists` and `json-valid` assertions. Use `--dry-run` to print the proposed JSON without writing files, `--summary` to print a human-readable review of generated cases/assertions, and `--force` to overwrite an existing `evals/evals.json`.

The positional `<skill-dir-or-repo>` for `run` is resolved as:
- a skill directory if it contains `evals/evals.json`,
- otherwise a repo whose tree is walked for SKILL.md + evals/evals.json pairs.

### Review reports

Turn a run directory into a static review bundle:

```bash
arc-skill-eval review ./skills/hello-world/evals-runs/<runId>
```

This writes `review.html` and `feedback.json` into the run directory. Use `--output <dir>` to write elsewhere and `--force` to overwrite an existing report. Compare runs are rendered with `with_skill` and `without_skill` variants side-by-side.

Model options:
- `--model <provider/model[:thinking]>` pins the skill runner model instead of using Pi's configured default. Example: `openai-codex/gpt-5.5:medium`.
- `--judge-model <provider/model[:thinking]>` pins the model used for LLM-judged string assertions. Deterministic assertions do not use the judge.
- `--agent-dir <path>` points Pi settings, model registry, and auth lookup at an eval-owned agent directory instead of the normal `~/.pi/agent` directory.
- When no model flags are supplied, `arc-skill-eval` inherits Pi's default provider/model/thinking level from the effective Pi agent settings.

### Eval-owned Pi runtime

Use `--agent-dir` when you want reproducible team or CI runs without depending on personal Pi defaults:

```bash
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

Create one with:

```bash
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b
```

Use `--force` to intentionally overwrite existing runtime files.

A minimal eval-owned runtime contains just:

```text
.arc-skill-eval/pi-agent/
├── models.json
└── settings.json
```

The runner and default LLM judge both use this directory for Pi `models.json`, `settings.json`, and `auth.json` lookup when `--agent-dir` is supplied. Secrets should still be referenced by environment variable name, for example `"apiKey": "OLLAMA_API_KEY"`, rather than committed as literal values.

### Ollama / low-cost cloud and local runs

`arc-skill-eval` inherits model support from Pi. Ollama Cloud is a useful low-cost provider lane for smoke tests. A verified working example is:

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

A recent run with `ollama-cloud/gpt-oss:20b` passed 2/3 `hello-world` cases. The failed case was model behavior on an ambiguous prompt, not provider failure: the model asked which name to use instead of defaulting to `Hello, world!`.

Pi can also be configured through Ollama's integration for local or proxied cloud models:

```bash
# Let Ollama install/configure Pi and launch an interactive session
ollama launch pi

# Configure Pi for Ollama without launching
ollama launch pi --config

# Example cloud model launch through Ollama
ollama launch pi --model qwen3.5:cloud
```

After Pi lists Ollama models, use the same provider/model pinning flags:

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama/qwen3.5:cloud \
  --judge-model ollama/qwen3.5:cloud
```

For direct Ollama Cloud access, set `OLLAMA_API_KEY` and add an `ollama-cloud` provider to Pi's `models.json`:

```json
{
  "providers": {
    "ollama-cloud": {
      "baseUrl": "https://ollama.com/v1",
      "api": "openai-completions",
      "apiKey": "OLLAMA_API_KEY",
      "models": [
        { "id": "gpt-oss:20b" },
        { "id": "ministral-3:3b" },
        { "id": "gemma3:4b" }
      ]
    }
  }
}
```

For local Ollama setup, add an Ollama-compatible provider to `~/.pi/agent/models.json` using `http://localhost:11434/v1` and set `defaultProvider` / `defaultModel` in `~/.pi/agent/settings.json`. Local models do not require `OLLAMA_API_KEY`.

For the runtime roadmap — a tiny eval-owned Pi config vs a future custom agent — see `docs/agent-runtime-strategy.md`.

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
- `docs/skill-eval-authoring-debrief.md` — detailed research debrief and playbook for creating evals for skills, including the `arc-skills` mastery roadmap.
- `docs/agent-runtime-strategy.md` — runtime strategy for Pi-backed evals, tiny eval-owned Pi config, Ollama Cloud, and a possible future custom agent.
- `docs/skill-creator-parity-plan.md` — user stories and implementation plan for Claude skill-creator parity features.
- `docs/skill-creator-parity-progress.txt` — checkbox tracker for the skill-creator parity roadmap.
- `docs/create-dogfood-report.md` — findings from dry-running `create` against real `arc-skills`.
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
