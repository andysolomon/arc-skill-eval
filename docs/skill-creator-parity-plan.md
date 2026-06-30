# Skill Creator Parity Roadmap

_Last updated: 2026-06-22_

## Objective

Close the most valuable gaps between `arc-skill-eval` and Anthropic's `skill-creator` workflow while keeping `arc-skill-eval` focused on reproducible CLI-driven skill evaluation.

This plan is based on:

- the existing `arc-skill-eval` CLI and artifacts
- `docs/agent-runtime-strategy.md`
- the observed Claude `skill-creator` capabilities: skill authoring, baseline comparison, review UI, feedback-driven iteration, description optimization, and packaging

## Scope boundaries

In scope:

- Eval-owned Pi runtime configuration
- Guided skill/eval creation workflows
- Human review artifacts for compare runs
- Feedback-driven iteration planning
- Trigger/description optimization
- Optional packaging support
- Experimental runtime abstraction for a future custom agent

Out of scope for this phase:

- Replacing Pi as the default runtime
- Full browser-hosted SaaS dashboard
- Automatic issue creation in Linear/GitHub/Agile Accelerator without explicit user approval
- Provider-specific fine-tuning or subscription management

---

# User Stories

## Epic: Reproducible Runtime Configuration

### User Story
**ID:** W-000019

As a skill author, I want `arc-skill-eval` to use an eval-owned Pi config directory so that eval runs do not depend on my personal `~/.pi/agent` defaults.

## Acceptance Criteria

### Scenario: Run with explicit eval agent directory
**Given** a project has `.arc-skill-eval/pi-agent/models.json` and `.arc-skill-eval/pi-agent/settings.json`
**When** I run `arc-skill-eval run ./skills/hello-world --agent-dir ./.arc-skill-eval/pi-agent`
**Then** the Pi model registry and settings are loaded from that directory
**And** run artifacts record the agent directory used.

### Scenario: Preserve current defaults when no agent directory is supplied
**Given** I do not pass `--agent-dir`
**When** I run an eval
**Then** `arc-skill-eval` continues to use the normal Pi agent directory for credentials and defaults.

## Context
Affected areas: `src/cli/argv.ts`, CLI types, `src/cli/run-evals-command.ts`, `src/pi/sdk-runner.ts`, README runtime docs.

Labels: `epic:runtime`, `priority:P0`, `size:M`

---

### User Story
**ID:** W-000020

As a skill author, I want a command to initialize a tiny eval runtime so that I can quickly create a clean Ollama Cloud or other provider-backed config.

## Acceptance Criteria

### Scenario: Initialize Ollama Cloud runtime
**Given** I have `OLLAMA_API_KEY` set
**When** I run `arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent --provider ollama-cloud --model gpt-oss:20b`
**Then** the command writes minimal `models.json` and `settings.json`
**And** the files reference `OLLAMA_API_KEY` without storing the secret value.

### Scenario: Refuse to overwrite without confirmation
**Given** runtime config files already exist
**When** I run `init-runtime` again without `--force`
**Then** the command exits with a clear message and does not overwrite existing files.

## Context
Affected areas: CLI command parser, new runtime config writer, docs, tests.

Labels: `epic:runtime`, `priority:P1`, `size:M`

---

## Epic: Guided Skill/Eval Creation

### User Story
**ID:** W-000021

As a skill creator, I want `arc-skill-eval create <skill-dir>` to inspect a skill and scaffold a starter eval suite so that every skill can get useful coverage without hand-writing `evals/evals.json` from scratch.

## Acceptance Criteria

### Scenario: Create starter evals for existing skill
**Given** a skill directory contains `SKILL.md` but no `evals/evals.json`
**When** I run `arc-skill-eval create ./my-skill`
**Then** the tool analyzes the skill description and instructions
**And** writes a draft `evals/evals.json` with trigger, execution, and negative cases
**And** summarizes the generated cases and any assumptions.

### Scenario: Do not overwrite existing evals by default
**Given** `evals/evals.json` already exists
**When** I run `arc-skill-eval create ./my-skill`
**Then** the command refuses to overwrite
**And** suggests `--update` or `--force`.

## Context
This should wrap or bundle the `arc-creating-evals` skill logic and then validate the generated JSON with existing readers.

Labels: `epic:creation`, `priority:P0`, `size:L`

---

### User Story
**ID:** W-000022

As a skill creator, I want generated evals to include deterministic assertions whenever possible so that pass/fail results are stable and cheap.

## Acceptance Criteria

### Scenario: Prefer file assertions for repo mutation skills
**Given** a skill creates or edits files
**When** starter evals are generated
**Then** cases include `file-exists`, `regex-match`, or `json-valid` assertions where appropriate
**And** prose assertions are only used for properties that cannot be checked deterministically.

### Scenario: Explain assertion choices
**Given** evals are generated
**When** the command finishes
**Then** the summary explains why each assertion is deterministic or judge-based.

## Context
Affected areas: creation prompt/templates, docs, eval authoring guidance.

Labels: `epic:creation`, `priority:P1`, `size:M`

---

## Epic: Human Review and Iteration

### User Story
**ID:** W-000023

As a skill author, I want a static HTML review report for compare runs so that I can inspect with-skill and without-skill outputs side by side.

## Acceptance Criteria

### Scenario: Generate review report from compare artifacts
**Given** a completed `arc-skill-eval run --compare`
**When** I run `arc-skill-eval review <run-dir>`
**Then** the command creates a standalone HTML file
**And** the report shows prompt, assistant output, produced files, grading results, token usage, timing, and benchmark deltas for each variant.

### Scenario: Include feedback capture format
**Given** I review a case in the static report
**When** I enter feedback and export it
**Then** the downloaded `feedback.json` uses a documented schema that `arc-skill-eval` can read later.

## Context
This mirrors the highest-value part of Claude `skill-creator`: putting qualitative outputs in front of the human before revising the skill.

Labels: `epic:review`, `priority:P0`, `size:L`

---

### User Story
**ID:** W-000024

As a skill author, I want `arc-skill-eval improve <skill-dir> --from-feedback feedback.json` to propose targeted skill changes so that human review turns into concrete next edits.

## Acceptance Criteria

### Scenario: Propose changes from feedback
**Given** a review report exported `feedback.json`
**When** I run the improve command
**Then** the tool reads feedback, grading failures, and traces
**And** produces a proposed patch or plan grouped by recurring issues.

### Scenario: Avoid overfitting to one case
**Given** feedback targets a single test case
**When** the tool proposes changes
**Then** it explains the general principle behind the change
**And** identifies whether new eval cases should be added.

## Context
Initial version may write `skill-improvement-plan.md` instead of auto-editing `SKILL.md`.

Labels: `epic:review`, `priority:P1`, `size:L`

---

## Epic: Trigger Description Optimization

### User Story
**ID:** W-000025

As a skill author, I want to generate trigger and non-trigger eval queries for a skill so that I can improve its frontmatter description without guessing.

## Acceptance Criteria

### Scenario: Generate realistic trigger evals
**Given** a skill with a description
**When** I run `arc-skill-eval optimize-description ./my-skill --generate-only`
**Then** the command writes a JSON set of should-trigger and should-not-trigger prompts
**And** negative prompts are adjacent near-misses rather than obviously irrelevant tasks.

### Scenario: Review before optimization
**Given** trigger evals are generated
**When** the command completes
**Then** it prints a path to the eval set and asks the user to review before running optimization.

## Context
This directly addresses Claude `skill-creator`'s description optimization loop.

Labels: `epic:triggering`, `priority:P1`, `size:M`

---

### User Story
**ID:** W-000026

As a skill author, I want repeated trigger evaluation with train/test split so that a rewritten description improves held-out trigger accuracy instead of overfitting.

## Acceptance Criteria

### Scenario: Evaluate current and candidate descriptions
**Given** a reviewed trigger eval set
**When** I run `arc-skill-eval optimize-description ./my-skill --eval-set trigger-evals.json --max-iterations 5`
**Then** the command evaluates current and proposed descriptions over multiple trials
**And** reports train and held-out scores for each iteration.

### Scenario: Apply best held-out description only on request
**Given** the optimizer finds a better description
**When** the run completes
**Then** it prints the before/after description and scores
**And** only updates `SKILL.md` if I pass `--apply` or confirm interactively.

## Context
May start as a Pi-backed routing-only evaluator before building a custom trigger simulator.

Labels: `epic:triggering`, `priority:P2`, `size:XL`

---

## Epic: Runtime Abstraction and Custom Agent Exploration

### User Story
**ID:** W-000027

As a maintainer, I want an internal runtime interface so that Pi remains the default while future custom agents can be tested behind the same eval contract.

## Acceptance Criteria

### Scenario: Existing Pi behavior moves behind an interface
**Given** the current Pi SDK runner
**When** runtime abstraction is introduced
**Then** existing CLI behavior and artifacts remain unchanged
**And** tests still pass without requiring live providers.

### Scenario: Runtime name is recorded
**Given** a case runs through any runtime
**When** artifacts are written
**Then** `trace.json` records the runtime name and version metadata.

## Context
This prepares for custom-agent exploration without committing to replacing Pi.

Labels: `epic:runtime`, `priority:P1`, `size:L`

---

### User Story
**ID:** W-000028

As a maintainer, I want an experimental OpenAI-compatible runtime spike so that I can evaluate whether a small custom agent is viable for deterministic skill evals.

## Acceptance Criteria

### Scenario: Run a basic file-writing eval through custom runtime
**Given** an OpenAI-compatible base URL and model
**When** I run an experimental runtime against `skills/hello-world`
**Then** the runtime can execute a minimal tool loop with read/write/bash/edit tools
**And** produces the same required artifact shape as the Pi runtime.

### Scenario: Clearly mark experimental output
**Given** the custom runtime is used
**When** artifacts are written
**Then** reports mark the runtime as experimental
**And** docs warn that skill-trigger behavior may differ from Pi.

## Context
Do this only after eval-owned Pi runtime support lands.

Labels: `epic:runtime`, `priority:P2`, `size:XL`

---

## Epic: Packaging and Distribution

### User Story
**ID:** W-000029

As a skill author, I want to package a finalized skill and its evals so that I can distribute a tested `.skill` bundle or repo artifact.

## Acceptance Criteria

### Scenario: Package skill with evals
**Given** a skill directory contains `SKILL.md` and `evals/evals.json`
**When** I run `arc-skill-eval package ./my-skill`
**Then** the command creates a distributable artifact
**And** includes evals and fixture files unless excluded.

### Scenario: Validate before packaging
**Given** the skill has invalid eval JSON
**When** I run package
**Then** the command fails with validation errors before creating the artifact.

## Context
Packaging is lower priority than runtime/review because distribution is only useful after the skill has proven behavior.

Labels: `epic:distribution`, `priority:P2`, `size:M`

---

# Implementation Plan

**Branch:** `feat/W-000019-skill-creator-parity`

## Analysis

The repo already has a strong eval runner foundation: skill discovery, fixture materialization, Pi SDK execution, deterministic and LLM assertions, per-case artifacts, compare mode, model pinning, and trace/telemetry normalization. The main gap versus Claude `skill-creator` is not raw eval execution; it is the product loop around evals: isolated runtime setup, guided creation, human review, feedback-based iteration, and trigger optimization.

The fastest path is to ship these as incremental CLI commands while keeping Pi as the default runtime.

## Phase 1 — Eval-owned Pi runtime

Goal: make model/runtime configuration reproducible without depending on global `~/.pi/agent` defaults.

Deliverables:

- Add `--agent-dir <path>` to `arc-skill-eval run`
- Thread the value through CLI types and run command options into the Pi SDK runner
- Load auth/model/settings from the supplied agent dir when present
- Record `agentDir` in artifacts
- Add docs for `.arc-skill-eval/pi-agent`
- Add `init-runtime` command for minimal Ollama Cloud config

Tasks:

- [x] 1.1 Extend CLI parser/help for `--agent-dir`
- [x] 1.2 Add CLI tests for `--agent-dir`
- [x] 1.3 Thread `agentDir` through run command and compare variants
- [x] 1.4 Update `createDefaultPiSdkSession` to use supplied credentials/config dir when present
- [x] 1.5 Add artifact metadata for effective config dir
- [x] 1.6 Implement `init-runtime` command with safe write/`--force`
- [x] 1.7 Document Ollama Cloud eval-owned runtime setup

Test Strategy:

- Unit: CLI arg parsing, config writer behavior, no-overwrite behavior
- Integration: injected Pi session verifies received agent dir
- Manual: run `skills/hello-world` with `ollama-cloud/gpt-oss:20b`

Risks:

- Pi SDK settings/auth behavior may expect global `getAgentDir()` in some paths
- Need to avoid writing secrets to disk

## Phase 2 — Guided eval creation command

Goal: turn `arc-creating-evals` into a first-class CLI flow.

Deliverables:

- `arc-skill-eval create <skill-dir>`
- Validated starter `evals/evals.json`
- Optional fixture scaffolding
- Summary explaining case classes and assertion choices
- Deterministic `file-exists` / `json-valid` assertions for obvious output artifacts

Tasks:

- [x] 2.1 Define create command contract and non-overwrite policy
- [x] 2.2 Add built-in starter generator from `SKILL.md` frontmatter
- [x] 2.3 Generate trigger, execution, and adjacent-negative cases
- [x] 2.4 Validate generated JSON with existing parser
- [x] 2.5 Add dry-run option for generated suite preview
- [x] 2.6 Add docs and examples
- [x] 2.7 Infer deterministic assertions from obvious `SKILL.md` artifact paths

Test Strategy:

- Unit: create command parsing and file overwrite behavior
- Fixture: generate evals for `skills/hello-world`
- Dogfood: run against `arc-skills/arc-creating-evals`

Risks:

- LLM-generated evals may overfit or assert on instructions rather than outcomes
- Need clear summary of assumptions and recommended human review

## Phase 3 — Static review report

Goal: make compare results reviewable by humans, not just machine-readable.

Deliverables:

- `arc-skill-eval review <run-dir>`
- Standalone HTML report
- Case-by-case with_skill vs without_skill comparison
- Feedback export schema

Tasks:

- [ ] 3.1 Define review input: single run dir, iteration dir, or latest run
- [ ] 3.2 Build artifact loader for assistant output, produced files, grading, trace, timing, benchmark
- [ ] 3.3 Create static HTML template with output tabs and benchmark table
- [ ] 3.4 Add feedback export/download JSON schema
- [ ] 3.5 Document human review workflow

Test Strategy:

- Unit: artifact loader handles missing optional files
- Snapshot: generated HTML contains expected sections
- Manual: generate review for an existing `--compare` dogfood run

Risks:

- Rendering arbitrary output files safely in static HTML
- Large traces could bloat reports; include summaries by default and link/embed raw JSON selectively

## Phase 4 — Feedback-driven improvement

Goal: turn human feedback into concrete skill changes or implementation plans.

Deliverables:

- `arc-skill-eval improve <skill-dir> --from-feedback <feedback.json>`
- Initial output as `skill-improvement-plan.md`
- Later optional `--apply` for proposed `SKILL.md` edits

Tasks:

- [ ] 4.1 Define feedback schema
- [ ] 4.2 Load feedback + associated run artifacts
- [ ] 4.3 Group failures by recurring pattern
- [ ] 4.4 Produce improvement plan with proposed skill edits and eval additions
- [ ] 4.5 Add optional patch generation behind confirmation

Test Strategy:

- Fixture feedback JSON with known issue patterns
- Verify output plan references cases and evidence
- Manual dogfood on `arc-creating-evals`

Risks:

- Auto-edits can overfit; start with plan-only mode
- Need to preserve skill author intent

## Phase 5 — Description optimization

Goal: improve skill triggering using generated positive/negative queries and held-out evaluation.

Deliverables:

- `arc-skill-eval optimize-description <skill-dir> --generate-only`
- Trigger eval set JSON
- Multi-iteration optimization command with train/test report
- Optional `--apply`

Tasks:

- [ ] 5.1 Define trigger eval schema
- [ ] 5.2 Generate 8-10 should-trigger and 8-10 should-not-trigger prompts
- [ ] 5.3 Add reviewable trigger eval HTML or markdown summary
- [ ] 5.4 Implement repeated routing evaluation
- [ ] 5.5 Add candidate description generation
- [ ] 5.6 Select best description by held-out score

Test Strategy:

- Unit: schema validation and train/test splitting
- Simulated: fake evaluator verifies optimizer selects held-out winner
- Manual: run on `arc-creating-evals` description

Risks:

- True trigger behavior depends on agent runtime and available skills
- Repeated model calls can be expensive; default to cheap cloud models and bounded trials

## Phase 6 — Runtime abstraction and custom-agent spike

Goal: prepare for custom runtimes without destabilizing Pi-backed evals.

Deliverables:

- Internal `AgentRuntime` interface
- `PiAgentRuntime` wrapper around current logic
- Experimental OpenAI-compatible custom runtime spike

Tasks:

- [ ] 6.1 Extract current run-case logic behind a runtime interface
- [ ] 6.2 Preserve existing artifact shape and tests
- [ ] 6.3 Add runtime metadata to traces
- [ ] 6.4 Spike tool loop with read/write/edit/bash tools
- [ ] 6.5 Run `hello-world` through experimental runtime
- [ ] 6.6 Compare behavior against Pi runtime and document tradeoffs

Test Strategy:

- Existing suite must remain green
- Add fake runtime tests
- Manual smoke against Ollama Cloud OpenAI-compatible endpoint

Risks:

- Custom runtime may not match Pi skill-trigger semantics
- Tool-calling differences across providers can consume significant time

---

# Acceptance Criteria Mapping

| Story | Phase | Verification |
|---|---:|---|
| W-000019 | 1 | CLI test + injected-session test proves `--agent-dir` is honored |
| W-000020 | 1 | Config writer tests + manual Ollama Cloud smoke |
| W-000021 | 2 | Generated `evals/evals.json` validates and runs one case |
| W-000022 | 2 | Generated cases include deterministic assertions when files are expected |
| W-000023 | 3 | Static report renders compare artifacts and benchmark deltas |
| W-000024 | 4 | Feedback fixture produces evidence-backed improvement plan |
| W-000025 | 5 | Trigger eval set contains realistic positive and adjacent-negative prompts |
| W-000026 | 5 | Optimizer reports train/test scores and only applies on request |
| W-000027 | 6 | Existing Pi behavior unchanged behind runtime interface |
| W-000028 | 6 | Experimental runtime runs `hello-world` and writes compatible artifacts |
| W-000029 | Later | Package command validates before producing artifact |

---

# Recommended delivery order

1. **W-000019** — `--agent-dir` support
2. **W-000020** — `init-runtime`
3. **W-000023** — static compare review report
4. **W-000021/W-000022** — guided eval creation
5. **W-000024** — feedback-to-improvement plan
6. **W-000025/W-000026** — description optimization
7. **W-000027/W-000028** — runtime abstraction and custom-agent spike
8. **W-000029** — packaging

This order prioritizes reproducibility and review UX before attempting a custom agent runtime.
