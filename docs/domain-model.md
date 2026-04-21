# Framework Domain Model

## Purpose
This document begins the domain-model documentation for `arc-skill-eval`.

It describes the core entities the framework is built around, how they relate to each other, and which ones already exist in code versus which are planned next.

## Status
- **Implemented now:** source loading, skill discovery, contract validation, contract normalization, initial Pi SDK runner orchestration, observer telemetry capture/loading, Pi SDK trace normalization
- **Planned next:** fixtures, scoring, reports, tiers, CLI orchestration

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
Cases now have an initial Pi SDK orchestration path for routing, deterministic execution, and live-smoke lanes. CLI parity still belongs to a separate runtime path.

---

## 8. Fixture
A **Fixture** describes the workspace and dependencies needed for deterministic execution.

### Current code
- `FixtureRef`
- `GitFixtureSpec`
- `ExternalFixtureSpec`
- related nested types

### Planned responsibilities
- materialize temp workspaces
- initialize git state
- provide mock servers and CLI shims
- attach env configuration safely

### Notes
Fixtures are defined in the contract model now but not yet materialized by runtime code.

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
This is the runtime boundary that lets later work attach fixture materialization and session-entry telemetry without changing the contract layer.
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

### Planned responsibilities
- apply hard assertions
- compute weighted soft scores
- aggregate by lane and by skill
- feed tier computation and reports

### Planned neighboring concepts
- scorer profile
- hard assertion result
- weighted dimension scores
- lane summary

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

### Planned responsibilities
- preserve provenance
- summarize lane/case outcomes
- include tier and score results
- support CI automation and human debugging

### Planned forms
- canonical JSON
- optional HTML rendering

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
- Pi SDK execution for routing, deterministic execution, and live-smoke cases
- workspace/session isolation
- raw session artifact capture
- observer telemetry capture and post-run session telemetry loading

### Current files
- `src/pi/types.ts`
- `src/pi/sdk-runner.ts`
- `src/pi/observer-extension.ts`
- `src/pi/session-telemetry.ts`

### Planned additions
- CLI parity runtime
- fixture materialization hooks

## Trace Context
Current responsibility:
- canonical trace types
- Pi SDK case-result normalization
- scorer-facing observations with raw debug artifacts attached

### Current files
- `src/traces/types.ts`
- `src/traces/normalize-sdk.ts`

## Scoring Context
Planned responsibility:
- assertions
- weighted scoring
- tier computation

## Reporting Context
Planned responsibility:
- JSON artifact generation
- optional HTML rendering
- baseline-aware summaries

---

## Immediate Documentation Follow-Ups
1. Keep this document aligned with `src/contracts/types.ts`, `src/load/source-types.ts`, `src/pi/types.ts`, and `src/traces/types.ts`
2. Extend the trace model once CLI JSON normalization exists
3. Add a scorecard/tier model section once scoring starts
4. Link CLI commands to these entities once `src/cli/` is implemented
