# Framework Domain Model

## Purpose
This document begins the domain-model documentation for `arc-skill-eval`.

It describes the core entities the framework is built around, how they relate to each other, and which ones already exist in code versus which are planned next.

## Status
- **Implemented now:** source loading, skill discovery, contract validation, contract normalization, hermetic fixture materialization, initial Pi SDK runner orchestration, observer telemetry capture/loading, Pi SDK and Pi CLI JSON trace normalization, case-level CLI golden parity comparison, deterministic scoring for routing and execution lanes, JSON-first reporting with optional HTML rendering, library-backed CLI commands for list/validate/test
- **Planned next:** tiers, parity-aware tier computation, pilot onboarding

## Divergent Experiments
- **Evalite conformance** — an experimental branch, `experiment/evalite-conformance`, explores replacing this framework's orchestration, CLI, and report artifact with Evalite's `evalite()` + SQLite + UI. `skill.eval.ts` files on that branch call `evalite()` directly via a `defineSkillEval()` helper. This experiment is **not intended for merge**; it is a source-of-truth comparison to decide whether `arc-skill-eval` should migrate. The canonical model in this document continues to describe the `main` architecture. See [experimental/evalite-conformance.md](experimental/evalite-conformance.md).

---

## Domain Overview

At a high level, the framework flows through these stages:

1. **Resolve a source**
2. **Discover participating skills**
3. **Load adjacent eval contracts**
4. **Validate and normalize contracts**
5. **Execute eval cases**
6. **Normalize traces**
7. **Score outcomes**
8. **Emit reports**

```text
RepoSource
  -> DiscoveredSkillFiles[]
  -> raw skill.eval.ts module
  -> SkillEvalContract
  -> NormalizedSkillEvalContract
  -> PiSdkRunnableCase
  -> PiSdkRunEnvironment
  -> PiSdkCaseRunResult
  -> PiSessionTelemetrySnapshot
  -> EvalTrace
  -> Scorecard / Tier result
  -> Report artifact
```

---

## Core Entities

## 1. Repo Source
A **Repo Source** identifies where a skill repo came from and how it was resolved.

### Responsibilities
- capture whether the repo came from a local checkout or a git clone
- preserve the original user input
- record resolved git metadata for reproducibility

### Current code
- `RepoSourceDescriptor`
- `GitResolutionMetadata`
- `GitRepoRequest`
- `GitRepoInput`

### Key fields
- `kind`
- `input`
- `repositoryRoot`
- `displayName`
- `resolvedRef`
- `git.{rootDir, commitSha, branch, originUrl}`

### Notes
This is the root provenance object for all later reporting.

---

## 2. Skill Discovery
A **Discovered Skill** is a directory that participates in evals because it contains both:
- `SKILL.md`
- `skill.eval.ts`

### Responsibilities
- identify participating skills only
- ignore non-participating directories
- preserve file-system locations for later loading and reporting

### Current code
- `DiscoveredSkillFiles`
- `discoverParticipatingSkills(...)`

### Key fields
- `skillName`
- `skillDir`
- `relativeSkillDir`
- `skillDefinitionPath`
- `evalDefinitionPath`

### Notes
Discovery is intentionally structural, not semantic. Validation happens later.

---

## 3. Raw Eval Contract
A **Raw Eval Contract** is the default export loaded from a skill's adjacent `skill.eval.ts`.

### Responsibilities
- provide author-defined eval configuration
- remain framework-independent at runtime
- allow sibling imports for maintainability

### Current code
- `loadSkillEvalContractModule(...)`

### Notes
This object is untrusted until validation succeeds.

---

## 4. Validated Contract
A **Validated Contract** is a contract that passes schema checks.

### Responsibilities
- guarantee required fields exist
- reject malformed values early
- produce actionable diagnostics for authors

### Current code
- `SkillEvalContract`
- `ValidationIssue`
- `ValidationResult<T>`
- `validateSkillEvalContract(...)`
- `SkillEvalContractValidationError`

### Notes
Validation establishes structural correctness, but not yet the framework's canonical defaulted form.

---

## 5. Normalized Contract
A **Normalized Contract** is the framework's canonical internal representation of a skill eval contract.

### Responsibilities
- apply framework defaults
- remove optionality where downstream consumers should not branch
- stabilize the shape used by loaders, runners, scorers, and reports

### Current code
- `NormalizedSkillEvalContract`
- `normalizeSkillEvalContract(...)`
- `validateAndNormalizeSkillEvalContract(...)`

### Normalized defaults currently applied
- `enforcement.tier = "warn"`
- `enforcement.score = "warn"`
- `overrides.weights = {}`
- `overrides.expectedSignals = []`
- `overrides.forbiddenSignals = []`
- `routing.hardNegative = []`
- `execution = []`
- `cliParity = []`
- `liveSmoke = []`
- `rubric.enabled = false`
- `rubric.prompts = []`

### Why this matters
Everything after contract loading should prefer `NormalizedSkillEvalContract` over the author-facing raw shape.

---

## 6. Load Result
A **Load Result** bundles provenance plus discovered/validated skills.

### Responsibilities
- return source metadata
- separate valid and invalid skills
- support temp-workspace lifecycle for git clones

### Current code
- `LocalRepoLoadResult`
- `ValidatedLocalRepoLoadResult`
- `GitRepoLoadResult`
- `ValidatedGitRepoLoadResult`
- `ValidatedSkillDiscovery`
- `InvalidSkillDiscovery`

### Notes
This is the current integration seam between loaders and future CLI commands.

---

## 7. Eval Case
An **Eval Case** is the unit of execution and scoring inside a normalized contract.

### Kinds
- routing case
- execution case
- CLI parity case
- live smoke case

### Current code
- `RoutingCase`
- `ExecutionCase`
- `ParityCase`
- `LiveSmokeCase`

### Responsibilities
- define prompts, fixtures, and expectations
- provide stable IDs for reporting and regression tracking
- declare hard assertions and optional custom assertions

### Notes
Cases now have an initial Pi SDK orchestration path for routing, deterministic execution, CLI parity SDK baselines, and live-smoke lanes. Declared `cliParity[]` cases also have a paired Pi CLI JSON runtime path used for same-invocation parity comparison.

---

## 8. Fixture
A **Fixture** describes the workspace and dependencies needed for deterministic execution.

### Current code
- `FixtureRef`
- `GitFixtureSpec`
- `ExternalFixtureSpec`
- related nested types
- `MaterializedFixture`
- `HookExecutionResult`
- `FixtureCleanupResult`
- `materializeFixture(...)`
- `resolveFixtureSourcePath(...)`
- `applyGitFixtureState(...)`
- `FixtureMaterializationError`

### Current responsibilities
- materialize temp workspaces from filesystem-backed fixture sources
- copy fixture directory contents into a fresh workspace root
- initialize first-class git state including branches, commits, tags, remotes, dirty files, and staged files
- run setup/teardown shell hooks and capture structured hook artifacts
- attach fixture env overlays safely for hooks and Pi runtime execution
- preserve declared external fixture metadata for later activation

### Planned responsibilities
- provide mock servers and CLI shims as active runtime dependencies
- add shared fixture catalogs/IDs beyond filesystem-path sources

### Notes
In the current implementation, relative fixture paths resolve from the participating skill directory. Pi SDK execution now materializes a fresh fixture workspace per execution/live-smoke case that declares a fixture.

---

## 9. Pi SDK Run Environment
A **Pi SDK Run Environment** defines the isolated workspace and session state for one or more SDK-driven eval cases.

### Responsibilities
- pin the working directory for the eval run
- isolate Pi agent state in a temp or caller-provided agent directory
- isolate session files for later telemetry loading
- provide a cleanup boundary after artifacts are no longer needed

### Current code
- `CreatePiSdkRunEnvironmentOptions`
- `PiSdkRunEnvironment`
- `createPiSdkRunEnvironment(...)`

### Key fields
- `workspaceDir`
- `agentDir`
- `sessionDir`
- `cleanup()`

### Notes
This is the runtime boundary that now composes with fixture materialization and session-entry telemetry without changing the contract layer.
Current implementation isolates session state per run while reusing the standard Pi credential/model configuration for auth resolution.

---

## 10. Pi SDK Session Artifact
A **Pi SDK Session Artifact** is the raw captured output from executing one eval case through the Pi SDK.

### Responsibilities
- preserve the session id/file for later inspection
- retain raw SDK events
- retain raw session messages
- preserve the concatenated assistant text visible during the run
- carry model and lane metadata into downstream normalization

### Current code
- `PiSdkRunnableCase`
- `PiSdkCaseRunResult`
- `PiSdkSkillRunResult`
- `runPiSdkCase(...)`
- `runValidatedSkillViaPiSdk(...)`
- `PiSdkCaseRunError`

### Notes
This is intentionally pre-trace. W-000007 will normalize these artifacts into the canonical scorer-facing trace model.

---

## 11. Pi Session Telemetry Snapshot
A **Pi Session Telemetry Snapshot** is the structured observer data loaded back from Pi session entries after a run completes.

### Responsibilities
- capture tool calls without scraping assistant prose
- record bash commands as first-class telemetry
- record file touches from edit/write operations
- record skill-read signals when `SKILL.md` files are explicitly read
- record lightweight external-call summaries for later scoring/inspection

### Current code
- `PI_SESSION_TELEMETRY_CUSTOM_TYPE`
- `PiSessionTelemetryEntry`
- `PiSessionTelemetrySnapshot`
- `createPiSessionTelemetryObserverExtension(...)`
- `loadPiSessionTelemetry(...)`
- `summarizePiSessionTelemetry(...)`

### Notes
This is the structured bridge between raw Pi SDK artifacts and the canonical trace model. It lives in session `custom` entries so it survives restarts and can be reloaded from the persisted session file.

---

## 12. Eval Trace
An **Eval Trace** is the canonical normalized record of what happened during an eval run.

### Current responsibilities
- capture case identity and provenance in one scorer-facing object
- capture normalized observations from session telemetry and raw session artifacts
- retain raw artifacts for debugging without forcing scorers to parse SDK events directly

### Current code
- `EvalTrace`
- `EvalTraceIdentity`
- `EvalTraceTiming`
- `EvalTraceObservations`
- `EvalTraceRawArtifacts`
- `normalizePiSdkCaseRunResult(...)`
- `normalizePiSdkSkillRunResult(...)`

### Current major sections
- `identity`
- `timing`
- `observations`
- `raw`

### Notes
This is the bridge between execution and scoring. The current implementation normalizes Pi SDK case results only; CLI JSON normalization will target the same canonical trace shape later.

---

## 13. Score Result
A **Score Result** is the deterministic evaluation of a trace against a case.

### Current code
- `DeterministicCaseScoreResult`
- `DeterministicSkillScoreResult`
- `AggregateScoreSummary`
- `ScoreDimensionResult`
- `scoreDeterministicCase(...)`
- `scoreDeterministicSkill(...)`
- `createWorkspaceContext(...)`
- `createWorkspaceContextFromPiSdkCaseResult(...)`

### Current responsibilities
- apply built-in hard assertions and local custom hard assertions
- compute weighted soft scores across trigger/process/outcome/style dimensions
- keep hard-fail semantics separate from weighted diagnostics
- aggregate scores by routing lane family, execution lane family, and overall skill
- evaluate aggregate thresholds with enforcement metadata
- score execution workspace outcomes against initial fixture baselines and final live workspace state

### Notes
Current deterministic scoring targets routing and deterministic execution only. Scores remain canonical in the `0..1` range and also expose derived `0..100` display values.

---

## 14. Tier Result
A **Tier Result** compares declared maturity against achieved maturity.

### Planned responsibilities
- compute `achievedTier`
- compare to `targetTier`
- explain missing requirements
- respect enforcement policy

---

## 15. Report Artifact
A **Report Artifact** is the durable output of a test run.

### Current code
- `ArcSkillEvalJsonReport`
- `buildJsonReport(...)`
- `stringifyJsonReport(...)`
- `writeJsonReport(...)`
- `renderHtmlReport(...)`
- `writeHtmlReport(...)`

### Current responsibilities
- preserve invocation-wide provenance and report metadata
- summarize scored skills, invalid skills, traces, and run issues in one canonical JSON artifact
- retain full per-case scoring breakdowns with shared top-level trace references
- preserve unscored executed cases such as live-smoke runs that are not yet part of deterministic scoring
- expose explicit placeholder sections for tier and trial metadata until those systems are implemented
- render a lightweight single-file HTML summary from canonical JSON data

### Notes
v1 reporting is intentionally JSON-first. HTML is a derived convenience view over the canonical report artifact rather than an independent reporting model.

---

## Relationship Map

```text
RepoSourceDescriptor
  1 -> many DiscoveredSkillFiles

DiscoveredSkillFiles
  1 -> 1 raw skill.eval.ts module
  1 -> 0..1 NormalizedSkillEvalContract
  1 -> 0..many ValidationIssue

NormalizedSkillEvalContract
  1 -> many RoutingCase
  1 -> many ExecutionCase
  1 -> many ParityCase
  1 -> many LiveSmokeCase

ExecutionCase / ParityCase / LiveSmokeCase
  0..1 -> FixtureRef

FixtureRef
  0..1 -> GitFixtureSpec
  0..1 -> ExternalFixtureSpec

NormalizedSkillEvalContract + Case + Fixture
  -> PiSdkRunEnvironment
  -> PiSdkCaseRunResult
  -> PiSessionTelemetrySnapshot
  -> EvalTrace
  -> Score Result
  -> Tier Result
  -> Report Artifact
```

---

## Current Bounded Contexts

## Loading Context
Responsible for:
- source resolution
- discovery
- contract module loading
- validated/normalized load results

### Current files
- `src/load/*`
- `src/contracts/validate.ts`
- `src/contracts/normalize.ts`

## Contract Context
Responsible for:
- author-facing schema
- canonical normalized schema
- validation issues and diagnostics

### Current files
- `src/contracts/types.ts`
- `src/contracts/validate.ts`
- `src/contracts/normalize.ts`

## Runtime Context
Current responsibility:
- Pi SDK execution for routing, deterministic execution, CLI parity baseline, and live-smoke cases
- Pi CLI JSON parity execution for declared `cliParity[]` cases
- workspace/session isolation
- raw session artifact capture
- observer telemetry capture and post-run session telemetry loading

### Current files
- `src/pi/types.ts`
- `src/pi/sdk-runner.ts`
- `src/pi/cli-json-runner.ts`
- `src/pi/telemetry-helpers.ts`
- `src/pi/observer-extension.ts`
- `src/pi/session-telemetry.ts`

### Planned additions
- richer CLI parity runtime controls only if the golden subset proves too narrow

## Trace Context
Current responsibility:
- canonical trace types
- Pi SDK case-result normalization
- Pi CLI JSON case-result normalization
- semantic parity comparison across normalized SDK and CLI traces
- scorer-facing observations with raw debug artifacts attached

### Current files
- `src/traces/types.ts`
- `src/traces/normalize-sdk.ts`
- `src/traces/normalize-cli-json.ts`
- `src/traces/compare-parity.ts`

## Scoring Context
Current responsibility:
- deterministic case scoring from canonical traces plus optional workspace context
- built-in hard assertions and typed local custom assertions
- exact-token canonical signal extraction
- weighted dimension scoring and lane/skill aggregation
- threshold evaluation with enforcement metadata

### Current files
- `src/scorers/types.ts`
- `src/scorers/signals.ts`
- `src/scorers/workspace.ts`
- `src/scorers/custom-assertions.ts`
- `src/scorers/engine.ts`
- `src/scorers/weights.ts`
- `src/scorers/profiles/*`

### Planned additions
- multi-trial aggregation
- CLI parity scoring inputs
- tier computation

## Reporting Context
Current responsibility:
- build canonical invocation-wide JSON report artifacts
- render lightweight single-file HTML summaries from canonical report data
- preserve shared top-level trace records and per-case trace refs
- surface invalid skills and invocation-level run issues alongside scored skills
- preserve unscored executed cases and first-class CLI parity case diagnostics with paired SDK/CLI trace refs
- expose explicit placeholders for tier and baseline sections until later work lands

### Current files
- `src/reporting/types.ts`
- `src/reporting/json-report.ts`
- `src/reporting/html-report.ts`

### Planned additions
- baseline comparison logic
- model-fingerprint normalization helpers
- richer HTML/report UX once pilot-scale CLI usage lands

---

## CLI Context
Current responsibility:
- parse a minimal v1 command surface for `list`, `validate`, and `test`
- resolve shared `<repo-or-path>` inputs into local or git-backed loads
- apply consistent `--skill` and `--case` selection semantics before validation/execution
- orchestrate Pi SDK execution, CLI parity execution, deterministic scoring, and report writing through library APIs
- expose human-readable stdout by default with opt-in canonical JSON stdout

### Current files
- `src/cli/types.ts`
- `src/cli/shared.ts`
- `src/cli/list-command.ts`
- `src/cli/validate-command.ts`
- `src/cli/test-command.ts`
- `src/cli/argv.ts`
- `src/cli/render.ts`
- `src/cli/run-cli.ts`
- `src/bin/arc-skill-eval.ts`

### Planned additions
- standalone report-view command wiring
- richer machine-facing CLI output controls if needed beyond `--json`
- pilot-oriented execution presets if the representative cohort needs them

---

## Immediate Documentation Follow-Ups
1. Keep this document aligned with `src/contracts/types.ts`, `src/load/source-types.ts`, `src/pi/types.ts`, `src/traces/types.ts`, `src/scorers/types.ts`, `src/reporting/types.ts`, and `src/cli/types.ts`
2. Add a scorecard/tier model section once tiering starts
3. Document pilot-oriented CLI workflows once `W-000013` starts
4. Revisit whether parity mismatches should eventually contribute to weighted tier evidence rather than remaining case-level only
