# Skill eval authoring debrief

_Last updated: 2026-06-17_

## Executive summary

The repo's most important magic power should be this loop:

> **Skill intent -> small realistic eval suite -> isolated with-skill / without-skill runs -> assertion grading -> benchmark delta -> skill improvement PR.**

For `arc-skill-eval`, the product should optimize for making that loop boring, repeatable, and portable across every skill in [`andysolomon/arc-skills`](https://github.com/andysolomon/arc-skills). The immediate opportunity is not another generic eval framework. It is a **skill-specific eval foundry**: a tool and bundled skill that can read a `SKILL.md`, interview for success criteria, generate `evals/evals.json` plus fixtures, run one cheap smoke case, and leave behind artifacts that prove whether the skill adds value over no skill.

This document distills research from OpenAI's skill-eval guidance, Anthropic/Agent Skills eval methodology, Anthropic's broader agent-eval guidance, and this repo's existing implementation. It then applies that methodology to the `arc-skills` library and proposes a concrete mastery plan.

## Sources reviewed

- OpenAI, **Testing Agent Skills Systematically with Evals**: emphasizes defining measurable success before writing or editing the skill, starting with small prompt sets, testing explicit and implicit triggering, using deterministic checks first, and extending suites as failures are discovered.
- Agent Skills, **Evaluating skill output quality**: documents the `evals/evals.json` convention, with-skill / without-skill baselines, iteration workspaces, `grading.json`, `timing.json`, `benchmark.json`, concrete evidence for PASS, and benchmark pattern analysis.
- Anthropic Engineering, **Demystifying evals for AI agents**: frames evals as prompt + run transcript/outcome + graders; recommends code graders where possible, LLM graders where necessary, clean isolated trials, positive and negative cases, partial-credit assertions, transcript review, and ongoing suite health.
- This repo: `README.md`, `docs/evals-json-pivot.md`, `src/evals/types.ts`, `src/evals/grade.ts`, and bundled `skills/arc-creating-evals/SKILL.md`.
- `andysolomon/arc-skills`: current skill inventory and the existing `arc-conventional-commits/evals/evals.json` suite.

## The skill-eval mental model

A skill eval is **not** only a final-answer test. It is a lightweight end-to-end test of a skill's ability to be selected, interpreted, executed, and constrained.

Each case should answer one or more of these questions:

1. **Routing / activation** — does the model load the skill when it should?
2. **Non-activation** — does it avoid the skill when the request is adjacent but different?
3. **Outcome** — did the workspace, file, issue, report, or artifact end in the desired state?
4. **Process** — did it avoid dangerous or wasteful behavior? Did it use required tools only when that matters?
5. **Style / format** — did the produced artifact follow the required shape?
6. **Efficiency** — did the skill reduce tokens, commands, time, or thrashing relative to baseline?

The core data structure is:

```text
prompt -> isolated run -> assistant.md + outputs/ + trace -> assertions -> grading.json
```

The core value signal is:

```text
with_skill pass rate - without_skill pass rate = skill value delta
```

Absolute pass rate answers "does this work?" Delta answers "does the skill help?" For a skills library, the delta is the headline metric.

## What `arc-skill-eval` already supports

Current repo capabilities are already close to the right product shape:

- Discovers `SKILL.md` + sibling `evals/evals.json`.
- Runs cases through Pi with the skill attached.
- Materializes fixture workspaces from `evals/files/` or explicit `setup` sources.
- Emits per-case artifacts: `assistant.md`, `outputs/`, `timing.json`, `grading.json`, `trace.json`, `tool-summary.json`, `context-manifest.json`.
- Supports deterministic assertions:
  - `{ "type": "file-exists", "path": "..." }`
  - `{ "type": "regex-match", "pattern": "...", "target": "assistant-text" | { "file": "..." } }`
  - `{ "type": "json-valid", "path": "..." }`
- Supports string assertions via LLM judge.
- Supports `--compare` for with-skill / without-skill benchmark generation.
- Supports `--extra-skill` and `--context-mode ambient` for distractor/conflict/loadout evals.
- Records context, tools, skill reads, external-looking calls, token usage, and estimated cost.

Important caveat from `src/evals/grade.ts`: the newer intent assertion objects (`kind: "behavior"`, `kind: "safety"`) are typed/validated, but trace-aware behavior and safety grading are not implemented yet. For now, author suites using legacy script assertions plus string judge assertions unless implementing those graders.

## Recommended eval suite shape for one skill

For most skills, start with **6-10 cases**. OpenAI mentions 10-20 prompts as useful for a single skill, while Anthropic's broader agent guidance says 20-50 simple tasks can be a strong start. For this repo, 6-10 is the right first-suite size because each case is an agent run and may mutate files.

### Case mix

| Class | Count | Purpose |
| --- | ---: | --- |
| Explicit trigger | 1-2 | User names the skill directly. Guards rename/frontmatter regressions. |
| Implicit trigger | 2-3 | User describes the real job without naming the skill. Tests `description`. |
| Adjacent negative | 1 | Similar domain, different task. Catches over-triggering. |
| Execution golden path | 1-2 | Fixture-backed proof that the skill changes the world correctly. |
| Edge/conflict | 1-2 | Existing config, missing prerequisite, ambiguous input, multi-tool conflict. |
| Live smoke | 0-1 | Only for external APIs; usually opt-in/off-CI. |

### Success dimensions

Use the four dimensions already embedded in `arc-creating-evals`:

1. **Outcome**: final files, issue body, report sections, deployed URL, generated keys, etc.
2. **Process**: required detection step, confirmation before destructive change, no live external call in offline mode, etc.
3. **Style**: exact headings, Gherkin format, legal-risk table, implementation-plan structure.
4. **Efficiency**: bounded tool calls, no redundant full-repo scans, no token blow-up relative to baseline.

Only assert dimensions that matter for the skill. Process assertions should be rare until trace-aware grading is implemented; prefer output/workspace evidence.

## Authoring workflow

### 1. Read the skill as a spec

Extract:

- frontmatter `name`
- frontmatter `description` trigger phrases
- workflow steps / phases
- required tools and external dependencies
- files it creates or edits
- human-in-the-loop boundaries
- explicit output contracts
- safety warnings / prerequisites

If the skill is vague, fix the skill before writing evals. A vague skill creates vague assertions.

### 2. Define success before cases

Write a short definition of done:

```md
For this skill, success means:
- Outcome: ...
- Process: ...
- Style: ...
- Efficiency: ...
```

This prevents evals from becoming arbitrary snapshots of one run.

### 3. Draft realistic prompts

Good prompts look like real user requests:

- include repo names, ticket IDs, file paths, or constraints when relevant
- do not mention implementation details unless it is an explicit-trigger case
- include one noisy real-world implicit prompt
- include one false-positive trap

Bad prompts are generic: "do the thing", "process this", "make it better".

### 4. Build minimal fixtures

Fixtures should be the smallest workspace that makes the case meaningful.

Good fixture examples:

- `package.json` with `standard-version` for migration case
- `.gitlab-ci.yml` with one bad pattern for GitLab CI case
- `progress.txt` and an idea spec for implementation-plan-progress
- PRD markdown with 3 requirements for PRD-to-issues

Avoid:

- `node_modules/`
- build outputs
- real credentials
- full production repos when a 5-file fixture is enough

Prefer explicit setup for new cases:

```json
"setup": {
  "kind": "seeded",
  "sources": [{ "from": "files/clean-repo", "to": "." }],
  "mountMode": "flatten-contents"
}
```

### 5. Layer assertions from strongest to weakest

Preferred order:

1. Deterministic workspace checks: file exists, valid JSON, regex in generated file.
2. Deterministic assistant-text regex for simple output contracts.
3. LLM-judged string assertions for judgment-heavy claims.
4. Human review notes for qualities that should not become brittle pass/fail checks.

Keep each case to **2-5 assertions**. More than that usually means the case is testing too much.

### 6. Run and inspect artifacts

Minimum loop:

```bash
npm run build
arc-skill-eval run <skill-dir> --case <case-id>
arc-skill-eval run <skill-dir> --compare --iteration 1
```

Then inspect:

- `assistant.md`: did the model actually do the task?
- `outputs/`: did the workspace state prove the outcome?
- `grading.json`: did every PASS cite concrete evidence?
- `tool-summary.json`: did tool use look sane?
- `context-manifest.json`: was the intended skill actually attached?
- `benchmark.json`: did with-skill beat baseline?

If an assertion always passes with and without the skill, it is not measuring skill value. Tighten or remove it.

## Assertion writing rules

### Strong assertions

```json
{ "type": "file-exists", "path": ".releaserc.json" }
```

```json
{ "type": "json-valid", "path": ".releaserc.json" }
```

```json
{
  "type": "regex-match",
  "pattern": "conventionalcommits",
  "target": { "file": ".releaserc.json" }
}
```

```json
"The response identifies standard-version as pre-existing versioning tooling before proposing migration steps."
```

### Weak assertions

Avoid these:

- "The response is good."
- "The response follows the skill."
- "The output is comprehensive."
- "The assistant should mention all important things."
- exact long prose snapshots unless the task truly requires exact text

### Evidence rule

A PASS must quote or reference concrete evidence. If the judge cannot cite a file, section, command, or exact output fragment, it should FAIL.

## Handling different skill archetypes

### 1. Repo-mutation skills

Examples: `arc-conventional-commits`, `arc-gitlab-glab`, `arc-implementation-plan-progress`, `arc-project-deploy-portfolio-sync`.

Best graders:

- file exists
- JSON/YAML validity where supported
- regex in generated configs
- package script presence
- no forbidden config remains
- assistant mentions detected prior state

Best fixtures:

- tiny repo with package/config files
- variant with conflicting existing tool
- variant with monorepo or missing prerequisite

### 2. Planning/documentation skills

Examples: `arc-planning-work`, `arc-planning-github-issues`, `arc-creating-user-stories`, `arc-prd-to-issues`, `arc-defining-work`.

Best graders:

- regex for required headings
- regex for Gherkin `Scenario:` / `Given` / `When` / `Then`
- LLM assertions for vertical slicing, independence, acceptance criteria mapping
- fixture PRD / issue input

Best fixtures:

- short PRD
- GitHub issue text
- existing story list with W-number high-water mark

### 3. Workflow orchestration skills

Examples: `arc-parallel-implement`, `arc-bug-fixer`, `arc-bug-finder`, `arc-git-pr-check`.

Best graders:

- assistant-text assertions about safety guard, branch/PR plan, tracker detection
- future trace-aware assertions for tool calls and command sequencing
- dry-run/sandbox fixtures until external effects are mockable

Best fixtures:

- repo with uncommitted changes
- fake issue/ticket markdown
- branch state represented in text fixture if real git setup is hard

### 4. External API / browser / SaaS skills

Examples: `arc-linear-issue-creator`, `arc-sf-jwt-bearer`, `arc-ideabrowser-openclaw-flow`, `arc-project-deploy-portfolio-sync`.

Best graders:

- offline plan output for normal CI
- scripts/assets generated locally
- explicit "asks for credentials / confirmation" assertions
- opt-in live smoke tests separated by tag/env

Best fixtures:

- mocked CLI outputs
- sample API response JSON
- fake `.env.example`, never real secrets

### 5. Expert-review skills

Examples: `arc-contract-review`, `arc-system-design`.

Best graders:

- required output sections
- coverage of known seeded risks/design issues
- LLM judge with a narrow rubric
- periodic human calibration

Best fixtures:

- short synthetic NDA or SaaS clause set with planted risks
- learner state file and target rung for system-design coaching

## `arc-skills` inventory and eval strategy

Current inventory from `andysolomon/arc-skills`:

| Skill | Archetype | Existing evals? | First eval focus |
| --- | --- | ---: | --- |
| `arc-conventional-commits` | Repo mutation | Yes | Use as reference suite; improve with fixtures committed if missing and compare runs. |
| `arc-creating-evals` | Meta/eval authoring | Yes | Dogfood suite exists in `arc-skills`; recent GPT 5.5 compare run passed the golden path with a `+16.7%` with-skill delta after tightening a behavior-specific assertion. |
| `arc-implementation-plan-progress` | Planning + file generation | No | Golden path creates/updates `progress.txt` and follows output contract. |
| `arc-ideabrowser-openclaw-flow` | Browser/data extraction + specs | No | Offline fixture from scraped idea page -> deterministic scaffold spec. |
| `arc-project-deploy-portfolio-sync` | Deployment workflow | No | Dry-run plan verifies Vercel + portfolio update sequence without credentials. |
| `arc-gitlab-glab` | GitLab CLI + CI | No | Fixture `.gitlab-ci.yml` -> corrected/reusable pipeline guidance. |
| `arc-git-pr-check` | Git workflow | No | Clean/dirty branch prompts; safety guard and PR workflow plan. |
| `arc-linear-issue-creator` | External API issue creation | No | Offline issue body JSON/Markdown and Linear context resolution questions. |
| `arc-prd-to-issues` | PRD decomposition | No | PRD fixture -> independently grabbable vertical-slice GitHub issues. |
| `arc-defining-work` | Work-item authoring | No | Codebase/PRD fixture -> W-numbered stories with Gherkin criteria. |
| `arc-creating-user-stories` | User-story authoring | No | Destination prompt + required Gherkin format. |
| `arc-planning-work` | Work-item planning | No | Issue fixture -> implementation plan with tasks, tests, AC mapping. |
| `arc-planning-github-issues` | GitHub issue planning | No | GitHub issue fixture -> plan format and no coding. |
| `arc-parallel-implement` | Multi-agent orchestration | No | Conflict detection and branch/PR plan; avoid actual parallel execution first. |
| `arc-bug-finder` | Investigation + tracker filing | No | Screenshot/symptom fixture -> root-cause bug report, not code fix. |
| `arc-bug-fixer` | Ticket validation + fix workflow | No | Fake bug ticket -> re-validation before implementation. |
| `arc-sf-jwt-bearer` | Salesforce auth workflow | No | Generates keypair instructions and asks for Connected App/HITL boundaries. |
| `arc-system-design` | Teaching/coaching | No | Learner state fixture -> design-before-code coaching response. |
| `arc-contract-review` | Expert document review | No | Synthetic NDA/SaaS agreement -> seeded risks + redlines. Note file uses `skill.md`, not `SKILL.md`, so portability/discovery may need cleanup. |

## Priority order for mastering our own skills

### Wave 0 — Make the meta-skill undeniable

**Target:** `arc-creating-evals`

Why first: if this skill works, it compounds across every other skill.

Proposed cases:

1. Explicit: "Use arc-creating-evals to write evals for this skill" with a tiny fixture skill.
2. Implicit: "Add eval coverage to this SKILL.md".
3. Golden path: fixture skill with file-generating behavior -> produces valid `evals/evals.json` and `evals/files/`.
4. Negative: user asks for a normal unit test, not a skill eval -> do not create `evals/evals.json` unless clarified.
5. Edge: skill has external API dependency -> marks live smoke as deferred/offline.

Assertions:

- `evals/evals.json` exists
- JSON valid
- contains `skill_name`
- contains explicit, implicit, negative, and execution case IDs
- response warns about model/judge configuration and full-suite command

### Wave 1 — Deterministic repo/file skills

These produce local artifacts, so they are easiest to grade reliably:

1. `arc-conventional-commits` — already started; make it the gold example.
2. `arc-implementation-plan-progress` — creates/updates `progress.txt` and has output-contract references.
3. `arc-prd-to-issues` — markdown input -> structured issue output.
4. `arc-defining-work` / `arc-creating-user-stories` — strict Gherkin/W-number formats.

Goal: get 4 skills to passing `--compare` runs with clear positive deltas.

### Wave 2 — CLI/platform workflow skills in offline mode

1. `arc-gitlab-glab`
2. `arc-git-pr-check`
3. `arc-linear-issue-creator`
4. `arc-sf-jwt-bearer`

Goal: separate **offline planning/config generation** from **live external execution**. The default suite should never require credentials.

### Wave 3 — Complex orchestration and subjective expertise

1. `arc-bug-finder`
2. `arc-bug-fixer`
3. `arc-parallel-implement`
4. `arc-contract-review`
5. `arc-system-design`

Goal: use narrow seeded scenarios and LLM judge assertions; add human review samples because these are judgment-heavy.

### Wave 4 — Live/browser/deployment smoke suites

1. `arc-ideabrowser-openclaw-flow`
2. `arc-project-deploy-portfolio-sync`

Goal: split default offline evals from opt-in live smokes. Live cases should be tagged and skipped unless required env vars are present.

## Proposed `evals.json` template

```json
{
  "version": "1",
  "skill_name": "arc-example",
  "evals": [
    {
      "id": "trigger-explicit-named",
      "prompt": "Use the arc-example skill to do the target job.",
      "expected_output": "The assistant follows the skill workflow and states the intended first step.",
      "assertions": [
        "The response indicates it is using the arc-example workflow.",
        "The response starts with the required detection or clarification step."
      ]
    },
    {
      "id": "trigger-implicit-realistic",
      "prompt": "A realistic user request that should trigger this skill without naming it.",
      "expected_output": "The assistant applies the skill's method and produces the expected kind of artifact.",
      "assertions": [
        "The response follows the skill's domain-specific method rather than giving generic advice."
      ]
    },
    {
      "id": "trigger-negative-adjacent",
      "prompt": "A similar-looking request that should not trigger the skill's full workflow.",
      "expected_output": "The assistant answers the adjacent request directly and does not start the skill workflow.",
      "assertions": [
        "The response does not propose the skill's multi-step setup or artifact generation workflow."
      ]
    },
    {
      "id": "execution-golden-path",
      "prompt": "Do the target job in this repo.",
      "setup": {
        "kind": "seeded",
        "sources": [{ "from": "files/golden", "to": "." }],
        "mountMode": "flatten-contents"
      },
      "expected_output": "The expected files are created or updated with the required content.",
      "assertions": [
        { "type": "file-exists", "path": "expected-output.md" },
        { "type": "regex-match", "pattern": "Required Heading", "target": { "file": "expected-output.md" } },
        "The response summarizes the artifact it created and any assumptions it made."
      ]
    }
  ]
}
```

## Product gaps and opportunities

### 1. Add a first-class `arc-skill-eval create` command

The bundled `arc-creating-evals` skill is the right interface, but the CLI should expose the workflow too:

```bash
arc-skill-eval create <skill-dir> --interactive
arc-skill-eval create <skill-dir> --from-skill --dry-run
```

Ideal behavior:

- reads `SKILL.md`
- proposes case list
- scaffolds fixtures
- writes `evals/evals.json`
- validates JSON
- runs one smoke case
- prints next commands

### 2. Make behavior/safety assertions real

The repo already has types for trace-aware assertions. Implementing them would unlock skill-specific process checks:

```json
{ "kind": "behavior", "id": "reads-skill", "method": "skill-read-required", "value": "arc-conventional-commits" }
```

```json
{ "kind": "safety", "id": "no-live-calls", "method": "no-live-external-calls" }
```

High-value methods:

- skill-read-required
- tool-call-required
- tool-call-forbidden
- command-forbidden
- external-call-forbidden
- no-forbidden-files-touched

### 3. Add suite health reports

After `--compare`, generate a short analysis:

- assertions passing in both variants -> low value
- assertions failing in both variants -> broken task or too hard
- with-only passes -> skill value
- without-only passes -> skill may hurt
- flaky cases across iterations -> ambiguous skill or evaluator

### 4. Add tags and skip policies

External skills need tags:

```json
"metadata": {
  "tags": ["offline", "live-smoke", "requires-linear-token"]
}
```

Then support:

```bash
arc-skill-eval run . --include-tag offline
arc-skill-eval run . --exclude-tag live-smoke
```

### 5. Add reference-solution checks

For fixture-heavy cases, support a checked-in `reference/` output that proves the grader is solvable. This follows Anthropic's guidance: if a reference solution cannot pass the grader, the task or grader is broken.

### 6. Improve discovery portability

`arc-contract-review` currently uses `skill.md` lowercase. Most conventions and this repo expect `SKILL.md`. Decide whether to normalize support for lowercase or fix that skill in `arc-skills`.

## CI strategy

Recommended layers:

1. **PR smoke:** run `arc-skill-eval run <changed-skill> --case <cheapest-trigger-case>`.
2. **PR deterministic:** run all offline cases for changed skills, no `--compare`.
3. **Nightly benchmark:** run all offline cases with `--compare` and publish `benchmark.json` summaries.
4. **Weekly live smoke:** only tagged live cases with credentials in a protected environment.
5. **Model upgrade gate:** run full `--compare` before changing default model or judge model.

## Definition of done for an ARC skill eval suite

A skill is "eval-ready" when:

- `SKILL.md` has clear trigger language.
- `evals/evals.json` exists and parses.
- Suite has at least one explicit trigger, two implicit triggers, one adjacent negative, and one fixture-backed execution case where applicable.
- Every fixture is minimal and credential-free.
- At least half of assertions are deterministic for repo/file skills.
- LLM assertions require concrete evidence.
- One local smoke case has been run and artifacts inspected.
- A `--compare` run shows a positive with-skill delta or explains why baseline is expected to tie.
- Failing/ambiguous cases are either fixed or documented as intentional capability evals.

## Immediate next steps

1. Use `arc-conventional-commits` as the canonical reference and ensure its fixtures are committed and runnable from a fresh clone.
2. Expand the existing `arc-creating-evals` dogfood suite from one proven golden path into the full 5-case suite under `arc-skills`.
3. Add `arc-skill-eval create` or a documented wrapper that invokes the bundled authoring skill.
4. Continue hardening low-cost model lanes. Ollama Cloud via `ollama-cloud/gpt-oss:20b` is verified as an infrastructure path; see `docs/agent-runtime-strategy.md` for setup and runtime strategy.
5. Implement trace-aware behavior/safety assertions.
6. Add tags/skip support for live-smoke separation.
7. Start Wave 1 coverage for `arc-implementation-plan-progress`, `arc-prd-to-issues`, and `arc-defining-work`.

The north-star demo should be simple: clone `arc-skills`, run one command, and get a table showing which ARC skills are proven, where they beat baseline, and exactly which assertion failed when they don't.
