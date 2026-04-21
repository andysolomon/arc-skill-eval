# Skill Evals v1 Specification

## Status
Draft v1

## Purpose
`arc-skill-eval` is a Pi-native framework and CLI for evaluating skills that ship adjacent:

- `SKILL.md`
- `skill.eval.ts`

Version 1 is intentionally optimized for **Pi-only execution** while establishing a strong evaluation standard for:
- routing behavior
- deterministic execution behavior
- fixture-driven regression testing
- score and coverage tracking over time

## Goals
- Provide a repeatable way to test skills end-to-end through Pi.
- Keep skill repos lightweight and portable.
- Use TypeScript end-to-end in the framework implementation.
- Support deterministic CI-friendly evaluation first.
- Allow richer rubric grading later without making it required.
- Support both local development and pinned git-ref execution.

## Non-Goals
- Multi-harness support in v1.
- BAML as a required dependency.
- Fully generic harness-neutral abstractions in the runtime layer.
- Requiring every skill repo to participate.

## Core Principles
1. **Pi-first and Pi-only in v1**
   - Pi SDK is the canonical runtime.
   - Pi CLI JSON is used for a small golden parity subset.
2. **Adjacent participation convention**
   - A skill is testable if it ships `SKILL.md` plus adjacent `skill.eval.ts`.
3. **Deterministic core**
   - Routing, process, and outcome assertions are the required foundation.
4. **Hermetic canonical runs**
   - Canonical evals run in isolated workspaces.
5. **Hard assertions plus weighted score**
   - Critical failures cannot be hidden by a good average score.
6. **Coverage tiers and maturity**
   - Skills declare a target tier; the framework computes the achieved tier.

---

## Terminology

See also: `docs/domain-model.md` for the evolving framework entity map and current implemented-vs-planned boundaries.

### Skill
A directory containing `SKILL.md` and, if participating in evals, `skill.eval.ts`.

### Contract
The normalized internal representation produced from a skill's `skill.eval.ts` file.

### Lane
A distinct evaluation track, such as:
- explicit routing
- implicit routing
- deterministic execution
- CLI parity
- live smoke
- rubric

### Profile
A skill category used to select default scorer packs and conventions:
- `planning`
- `repo-mutation`
- `external-api`
- `orchestration`

### Target Tier
The maturity level declared by the skill author.

### Achieved Tier
The maturity level computed by the framework based on implemented lanes and passing requirements.

---

## Participation Model
A skill participates in evals if the repo contains:

```text
my-skill/
├── SKILL.md
└── skill.eval.ts
```

### Adjacent File Convention
- `SKILL.md` remains the human- and agent-facing skill definition.
- `skill.eval.ts` is the adjacent machine-readable TypeScript eval definition.
- The framework discovers only skills that provide both files.

### TypeScript Eval Definition Rule
`skill.eval.ts` must be **schema-only TypeScript**:
- plain exported data objects
- optional local imports from sibling files
- no runtime dependency on `arc-skill-eval`

This keeps skill repos decoupled from the framework package.

---

## Loading Model

### Supported Loaders
v1 supports two loading modes:

1. **Local checkout loader**
   - for local authoring and debugging
2. **Git clone loader**
   - for CI and pinned-ref reproducibility

### Source Resolution
Supported sources should include patterns like:
- local filesystem path
- `github:owner/repo@ref`
- git URL + ref

The framework resolves the repo, discovers adjacent skill eval files, and records the resolved source/ref in run metadata.

---

## Runtime Model

### Canonical Runtime
Pi SDK is the canonical execution path.

Reasons:
- better programmatic control
- better hermeticity
- stronger event access
- easier fixture setup
- easier integration with TypeScript scoring and reporting

Current implementation note:
- the framework now has an initial Pi SDK runner that executes selected contract cases and captures raw session artifacts
- session state is isolated per eval run while model credentials continue to come from the normal Pi auth/model configuration
- observer telemetry is appended to Pi session `custom` entries and reloaded after the run as structured tool/command/file telemetry
- Pi SDK case results can now be normalized into a canonical trace shape for downstream scoring

### CLI Parity Runtime
Pi CLI JSON mode is used for a **fixed golden subset** of cases.

Purpose:
- detect SDK/CLI drift
- validate shipped CLI behavior
- keep parity scope intentionally small

### Observer Extension
v1 includes a dedicated Pi observer extension for eval telemetry.

The extension should:
- remain read-only
- record telemetry to **session entries**
- avoid changing the skill's behavior

Telemetry includes signals such as:
- skill reads
- tool calls
- bash commands
- touched files
- external call summaries
- custom profile signals

---

## Canonical Trace Model
Scorers must target a normalized trace shape rather than raw Pi events directly.

Current v1 Pi SDK shape:

```ts
type EvalTrace = {
  identity: {
    runtime: "pi-sdk";
    source: RepoSourceDescriptor;
    skill: {
      name: string;
      relativeSkillDir: string;
      profile: "planning" | "repo-mutation" | "external-api" | "orchestration";
      targetTier: 0 | 1 | 2 | 3;
    };
    case: {
      caseId: string;
      kind: "routing" | "execution" | "live-smoke";
      lane:
        | "routing-explicit"
        | "routing-implicit-positive"
        | "routing-adjacent-negative"
        | "routing-hard-negative"
        | "execution-deterministic"
        | "live-smoke";
      prompt: string;
    };
    model: ModelSelection | null;
  };
  timing: {
    startedAt: string;
    finishedAt: string;
    durationMs: number;
  };
  observations: {
    assistantText: string;
    toolCalls: Array<{ toolName: string; inputSummary?: string }>;
    toolResults: Array<{ toolName: string; isError: boolean }>;
    bashCommands: string[];
    touchedFiles: Array<{ path: string; toolName: "edit" | "write" }>;
    writtenFiles: string[];
    editedFiles: string[];
    skillReads: Array<{ path: string; skillName: string }>;
    externalCalls: Array<{ system: string; operation: string; target?: string }>;
  };
  raw: {
    sessionId: string;
    sessionFile?: string;
    messages: unknown[];
    sdkEvents: unknown[];
    telemetryEntries: unknown[];
  };
};
```

Raw events should be retained for debugging, but normalized trace fields are the canonical scorer input.

---

## Evaluation Lanes

### 1. Explicit Routing
Tests whether the skill behaves correctly when directly invoked.

Examples:
- `/skill:arc-planning-work ...`
- prompt language that explicitly references the skill

### 2. Implicit Routing
Tests whether the skill is correctly discovered and selected from its description.

### 3. Deterministic Execution
Runs a fixture-backed case and scores process/outcome deterministically.

### 4. CLI Golden Parity
Runs a fixed golden subset through Pi CLI JSON mode and compares normalized output.

### 5. Live Smoke
For `external-api` skills only, used as a high-maturity lane with narrow credentialed checks.

### 6. Rubric
Optional lane for model-based judgment. Supported architecturally, not required in v1 core.

---

## Coverage Tiers

### Tier 0
- explicit routing only

### Tier 1
- explicit routing
- implicit routing
- deterministic execution

### Tier 2
- Tier 1
- CLI parity golden subset

### Tier 3
- Tier 2
- profile-specific advanced lanes
- for `external-api` skills, at least one live smoke lane

### Tier Representation
Each skill declares a `targetTier`.
The framework computes `achievedTier`.

The framework must report:
- target tier
- achieved tier
- missing requirements

---

## Enforcement Model

### Tier Enforcement
Tier enforcement is **opt-in hard gate**.

Each skill may choose whether tier mismatch is:
- warning only
- required/failing

### Score Enforcement
Score thresholds are tracked separately from tier coverage.

This separates:
- **what lanes exist**
- **how well they perform**

Per-skill thresholds may include:
- overall score
- routing score
- execution score
- parity score

---

## Scoring Model

### Hard Assertions
Certain failures are always fatal.
Examples:
- forbidden files touched
- forbidden external calls in mocked lanes
- wrong skill selected in explicit routing lane
- branch safety violations

### Weighted Score
Non-fatal assertions contribute to a weighted score.

Suggested dimensions:
- `trigger`
- `process`
- `outcome`
- `style`

### Deterministic Core
v1 requires deterministic scoring for core lanes.
This includes assertions such as:
- signal includes/excludes
- text includes/excludes
- file existence
- command usage
- artifact checks
- custom deterministic assertions

### Profile Defaults + Skill Overrides
Each profile provides default scorer packs and expectations.
Each skill may override:
- weights
- expected signals
- forbidden signals
- custom assertions
- thresholds

### Assertion Style
v1 supports **hybrid assertions**:
- declarative assertions by default
- typed custom assertions as escape hatches

---

## Nondeterminism Policy

### Trial Policy
v1 uses **selective retries**:
- default `trialCount = 1`
- per-skill, per-lane, or per-case overrides allowed

### Multi-Trial Aggregation
For multi-trial cases:
- hard assertions fail on any violating trial
- canonical soft score uses **median**
- mean/min/max should also be reported

---

## Model Selection
v1 uses **profile default models plus skill/case overrides**.

The framework should allow profile-level defaults for:
- provider
- model
- thinking level

### Regression Baselines and Model Changes
v1 uses **dual reporting**:
- canonical pass/fail compares against the same model fingerprint
- reports may also show deltas against the previous profile-default model when that changes

---

## Fixture Model

### Canonical Isolation
Canonical evals run hermetically.

Expected controls:
- temp workspace
- isolated Pi agent dir
- isolated session state
- explicit skill loading
- explicit extension loading
- no ambient global skills/settings unless explicitly requested

### Ambient Dev Mode
Ambient mode may exist for local experimentation, but is not canonical for scoring.

### Fixture Strategy
v1 uses **hybrid fixtures**:
- synthetic fixtures for deterministic coverage
- frozen real-world snapshots for golden realism

### Fixture Ownership
Hybrid ownership:
- skill-specific fixtures can live adjacent to skills
- shared reusable fixtures can live centrally in the framework repo

### Fixture Materialization
Current v1 materialization strategy:
- resolve filesystem-backed fixture sources relative to the skill directory
- copy fixture contents into a fresh temp workspace root per case
- run optional setup hooks before execution
- run optional teardown hooks during final cleanup
- flow fixture env into hooks and Pi execution

### First-Class Git Fixture State
Git state is a first-class fixture concern.
Fixture specs should be able to express:
- commits/history
- tags
- default branch
- current branch
- dirty files
- staged files
- remotes

### External Dependency Mocking
v1 uses **hybrid mocking**:
- mock servers for API-native integrations
- CLI shims for CLI-native workflows

Current implementation note:
- external fixture metadata can be declared and preserved during materialization
- active mock-server and CLI-shim orchestration remains a later follow-on

---

## Reporting

### Canonical Artifact
The canonical report artifact is structured JSON.

It should include:
- skill name
- profile
- source repo/ref
- case IDs
- lane
- target/achieved tier
- thresholds
- hard assertion results
- weighted scores
- trial statistics
- model fingerprint
- trace references
- baseline comparison metadata

### Human View
An optional/generated HTML report should be produced from the JSON report.

---

## CLI Surface
Illustrative commands:

```bash
arc-skill-eval list <repo-or-path>
arc-skill-eval validate <repo-or-path>
arc-skill-eval test <repo-or-path>
arc-skill-eval test <repo-or-path> --skill arc-planning-work
arc-skill-eval report <results.json>
```

Potential source forms:

```bash
arc-skill-eval test ../arc-skills
arc-skill-eval test github:andysolomon/arc-skills@main
```

---

## Pilot Cohort
The representative pilot cohort for v1 should cover three profiles:

1. `arc-planning-work`
   - `planning`
2. `arc-conventional-commits`
   - `repo-mutation`
3. `arc-linear-issue-creator`
   - `external-api`

Deferred for later iterations:
- `arc-parallel-implement`
- `arc-project-deploy-portfolio-sync`
- `arc-sf-jwt-bearer`

---

## Rubric Lane Policy
v1 includes an **optional rubric extension point**.

This means:
- deterministic scoring is real and complete in v1
- the framework defines rubric interfaces and result slots
- no rubric backend is required in the first implementation
- BAML remains optional and can be introduced later if justified

---

## Adoption Guidance
The framework may test any participating skill repo that ships adjacent eval files.
Within a given skill repo, authors may still adopt coverage in phases via target tiers.

Suggested team policy:
- new participating skills should start at least at Tier 0
- important skills should progress toward Tier 1/2
- external-api skills that want Tier 3 should add live smoke

---

## Immediate Next Deliverables
1. Framework repo structure draft
2. `skill.eval.ts` schema draft
3. Initial local loader and contract validator
4. Pi SDK runner and observer extension
