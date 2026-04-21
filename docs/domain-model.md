# Framework Domain Model

## Purpose
This document begins the domain-model documentation for `arc-skill-eval`.

It describes the core entities the framework is built around, how they relate to each other, and which ones already exist in code versus which are planned next.

## Status
- **Implemented now:** source loading, skill discovery, contract validation, contract normalization
- **Planned next:** execution traces, fixtures, scoring, reports, tiers, CLI orchestration

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
  -> Eval run inputs
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
Cases already exist structurally, but run orchestration has not been implemented yet.

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

## 9. Eval Trace
An **Eval Trace** is the canonical normalized record of what happened during an eval run.

### Planned responsibilities
- capture routing decisions
- capture tool/process activity
- capture final user-visible outcome
- retain raw artifacts for debugging

### Planned major sections
- routing
- process
- outcome
- raw artifacts

### Notes
This is the bridge between execution and scoring.

---

## 10. Score Result
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

## 11. Tier Result
A **Tier Result** compares declared maturity against achieved maturity.

### Planned responsibilities
- compute `achievedTier`
- compare to `targetTier`
- explain missing requirements
- respect enforcement policy

---

## 12. Report Artifact
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
  -> Eval run
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
Planned responsibility:
- Pi SDK and CLI execution
- telemetry capture
- workspace/session control

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
1. Keep this document aligned with `src/contracts/types.ts` and `src/load/source-types.ts`
2. Add a trace model section once `src/traces/types.ts` exists
3. Add a scorecard/tier model section once scoring starts
4. Link CLI commands to these entities once `src/cli/` is implemented
