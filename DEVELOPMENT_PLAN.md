# arc-skill-eval Development Plan

## Objective
Build a Pi-native skill evaluation framework and CLI for testing skills that ship adjacent `SKILL.md` + `skill.eval.ts` files.

## Product Constraints
- Separate repo and npm package: `arc-skill-eval`
- Pi-only for v1 runtime implementation
- Library + CLI package shape
- Skills remain portable; evals live adjacent to participating skills
- Deterministic core scoring with optional rubric extension point

## Execution Model
- **Sprint cadence:** Sprint 0 is **5 working days** for repo foundation; Sprints 1-4 are **10 working days / 2 weeks** each.
- **Planning horizon:** 2026-04-20 through 2026-06-19.
- **Vertical-slice rule:** each sprint must end with one usable slice, not just internal plumbing.
- **Tag legend:**
  - `[AFK]` = implementation can proceed autonomously once scoped.
  - `[HITL]` = requires a human checkpoint for approval, credentials, environment access, or release gating.

## Sprint Roadmap and Milestone Checkpoints

| Sprint | Dates | Duration | Wave Focus | Stories | Milestone checkpoint |
|---|---|---:|---|---|---|
| Sprint 0 | 2026-04-20 → 2026-04-24 | 5 days | Repo foundation + planning readiness | W-000001, W-000002 | **M0:** repo can ship incrementally and the execution plan is explicit enough to start coding |
| Sprint 1 | 2026-04-27 → 2026-05-08 | 10 days | Contract loading + validation | W-000003, W-000004 | **M1:** at least one participating skill can be discovered and its contract validated locally |
| Sprint 2 | 2026-05-11 → 2026-05-22 | 10 days | Pi execution core | W-000005, W-000006, W-000007 | **M2:** one deterministic eval can run through Pi SDK and emit a canonical trace |
| Sprint 3 | 2026-05-25 → 2026-06-05 | 10 days | Fixtures + scoring + reporting | W-000008, W-000009, W-000010 | **M3:** one fixture-backed eval can be scored deterministically and written as JSON |
| Sprint 4 | 2026-06-08 → 2026-06-19 | 10 days | CLI + parity + pilot cohort | W-000011, W-000012, W-000013 | **M4:** library-backed CLI validates the pilot cohort and surfaces parity/reporting gaps |

## Story Dependency Map

| Story | Tag | Depends on | Unblocks | Human checkpoint |
|---|---|---|---|---|
| W-000001 | [HITL] | none | W-000003, W-000011 | GitHub workflow permissions, release token strategy, dry-run review |
| W-000002 | [AFK] | none | W-000003, W-000004, W-000013 | none |
| W-000003 | [AFK] | W-000001, W-000002 | W-000005, W-000011 | none |
| W-000004 | [AFK] | W-000002 | W-000005, W-000007, W-000011 | schema edge cases reviewed asynchronously if rules change |
| W-000005 | [HITL] | W-000003, W-000004 | W-000006, W-000007, W-000008 | Pi SDK runtime assumptions and model defaults confirmed |
| W-000006 | [AFK] | W-000005 | W-000007, W-000009 | none |
| W-000007 | [AFK] | W-000005, W-000006 | W-000009, W-000010, W-000012 | none |
| W-000008 | [AFK] | W-000005 | W-000009, W-000013 | none |
| W-000009 | [AFK] | W-000007, W-000008 | W-000010, W-000013 | threshold tuning review only if scoring proves unstable |
| W-000010 | [AFK] | W-000007, W-000009 | W-000011, W-000013 | none |
| W-000011 | [AFK] | W-000003, W-000004, W-000005, W-000010 | W-000012, W-000013 | none |
| W-000012 | [AFK] | W-000007, W-000011 | W-000013 | none |
| W-000013 | [HITL] | W-000008, W-000011, W-000012 | v1 architecture signoff | pilot skill owners confirm fixtures, credentials, and success thresholds |

---

## Wave 0 — Repo Foundation and Release Automation
**Sprint:** Sprint 0 (2026-04-20 → 2026-04-24, 5 days)  
**Milestone:** **M0** — repo can ship incrementally and has an execution-ready plan.

### W-000001 — Bootstrap repo metadata and semantic release `[HITL]`
#### User Story
**ID:** W-000001

As a framework maintainer, I want the repo initialized with Conventional Commits and semantic-release so that every merged change can produce a traceable automated version.

#### Dependencies
- Depends on: none
- Blocks: W-000003, W-000011
- Milestone checkpoint: release workflow exists, dry-run reviewed, and human confirms required GitHub permissions

#### Acceptance Criteria
##### Scenario: semantic-release baseline is installed
**Given** a new `arc-skill-eval` repo  
**When** the repository is initialized  
**Then** it contains a valid `package.json`, semantic-release configuration, and release workflow  
**And** the package is prepared to start release cycles at `0.1.0`

#### Notes
Keep this story narrow: release plumbing only. Enforcement and richer CI gates can land later.

### W-000002 — Capture v1 framework plan `[AFK]`
#### User Story
**ID:** W-000002

As a framework maintainer, I want a written development plan at repo root so that implementation waves, dependencies, and pilot scope are visible before coding starts.

#### Dependencies
- Depends on: none
- Blocks: W-000003, W-000004, W-000013
- Milestone checkpoint: plan includes sprint dates, dependencies, AFK/HITL tags, milestones, and exit criteria

#### Acceptance Criteria
##### Scenario: plan is saved in repo
**Given** the repo root  
**When** the planning step completes  
**Then** a markdown implementation plan exists  
**And** it includes waves, stories, pilot skills, and exit criteria

---

## Wave 1 — Contract Loading and Validation
**Sprint:** Sprint 1 (2026-04-27 → 2026-05-08, 10 days)  
**Milestone:** **M1** — local discovery and validation work for at least one participating skill.

### W-000003 — Discover participating skills via adjacent eval files `[AFK]`
#### User Story
**ID:** W-000003

As a framework user, I want the tool to discover skills with adjacent `skill.eval.ts` files so that only explicitly testable skills are loaded.

#### Dependencies
- Depends on: W-000001, W-000002
- Blocks: W-000005, W-000011
- Milestone checkpoint: discovery works against a local repo and records enough metadata for later source/ref reporting

#### Acceptance Criteria
##### Scenario: local repo discovery
**Given** a local skill repo  
**When** I run discovery  
**Then** the framework finds each `SKILL.md` with an adjacent `skill.eval.ts`  
**And** non-participating skills are ignored

##### Scenario: remote repo discovery
**Given** a git repo reference  
**When** the framework clones the repo to a temp workspace  
**Then** it discovers the same adjacent eval files  
**And** the resolved ref is recorded in the run metadata

#### Notes
Implement the local path first; remote discovery can reuse the same adjacency logic once source loading exists.

### W-000004 — Validate schema-only TypeScript eval contracts `[AFK]`
#### User Story
**ID:** W-000004

As a skill author, I want `skill.eval.ts` files validated against a stable schema so that authoring errors fail fast before runtime execution.

#### Dependencies
- Depends on: W-000002
- Blocks: W-000005, W-000007, W-000011
- Milestone checkpoint: validator reports field-level errors with stable paths and blocks invalid contracts

#### Acceptance Criteria
##### Scenario: valid contract passes
**Given** a well-formed `skill.eval.ts`  
**When** validation runs  
**Then** the framework normalizes it into the internal contract model

##### Scenario: invalid contract fails with actionable diagnostics
**Given** a malformed contract  
**When** validation runs  
**Then** the framework exits with precise field-level errors  
**And** the skill is not executed

---

## Wave 2 — Pi Execution Core
**Sprint:** Sprint 2 (2026-05-11 → 2026-05-22, 10 days)  
**Milestone:** **M2** — one deterministic Pi SDK eval produces canonical runtime artifacts.

### W-000005 — Run skills through the Pi SDK `[HITL]`
#### User Story
**ID:** W-000005

As a framework user, I want eval cases to execute through the Pi SDK so that runs are deterministic, fast, and deeply observable.

#### Dependencies
- Depends on: W-000003, W-000004
- Blocks: W-000006, W-000007, W-000008
- Milestone checkpoint: a human confirms SDK runtime assumptions, model defaults, and workspace isolation strategy before broad rollout

#### Acceptance Criteria
##### Scenario: SDK run executes a case
**Given** a valid contract and fixture  
**When** a deterministic execution case is launched  
**Then** Pi runs in a hermetic workspace  
**And** the framework captures the full session result

### W-000006 — Record observer telemetry in session entries `[AFK]`
#### User Story
**ID:** W-000006

As a scorer, I want Pi observer telemetry written to session entries so that skill reads, tool calls, commands, and touched files can be scored without parsing brittle text.

#### Dependencies
- Depends on: W-000005
- Blocks: W-000007, W-000009
- Milestone checkpoint: telemetry is appended consistently and can be loaded post-run without altering skill behavior

#### Acceptance Criteria
##### Scenario: telemetry entry is appended
**Given** an eval run in progress  
**When** the observer extension sees relevant events  
**Then** it appends structured eval telemetry to the Pi session  
**And** the framework can read that telemetry after the run

### W-000007 — Normalize Pi output into canonical traces `[AFK]`
#### User Story
**ID:** W-000007

As a scorer author, I want SDK events, CLI JSON events, and observer telemetry normalized into one trace shape so that scoring logic targets one canonical model.

#### Dependencies
- Depends on: W-000005, W-000006
- Blocks: W-000009, W-000010, W-000012
- Milestone checkpoint: canonical trace object is emitted with raw artifacts still attached for debugging

#### Acceptance Criteria
##### Scenario: trace normalization succeeds
**Given** a Pi SDK run and its session telemetry  
**When** normalization completes  
**Then** the framework emits one canonical trace object  
**And** raw artifacts remain attached for debugging

---

## Wave 3 — Fixtures, Deterministic Scoring, and Reporting
**Sprint:** Sprint 3 (2026-05-25 → 2026-06-05, 10 days)  
**Milestone:** **M3** — one fixture-backed case can be scored and reported deterministically.

### W-000008 — Materialize hermetic fixtures with first-class git state `[AFK]`
#### User Story
**ID:** W-000008

As a framework user, I want fixtures copied into temp workspaces with optional git state and setup hooks so that repo-mutation and orchestration skills can be tested repeatably.

#### Dependencies
- Depends on: W-000005
- Blocks: W-000009, W-000013
- Milestone checkpoint: fixture materialization can recreate declared git state and setup hooks without leaking state between runs

#### Acceptance Criteria
##### Scenario: repo fixture with git state
**Given** a fixture spec with initial commits, branch state, and dirty files  
**When** the fixture is materialized  
**Then** the workspace reflects the declared git state  
**And** case setup hooks run successfully

### W-000009 — Score deterministic lanes with profile defaults and overrides `[AFK]`
#### User Story
**ID:** W-000009

As a framework maintainer, I want profile-based scorer packs with per-skill overrides so that common scoring behavior is shared while edge cases remain expressible.

#### Dependencies
- Depends on: W-000007, W-000008
- Blocks: W-000010, W-000013
- Milestone checkpoint: at least one planning case can be scored end-to-end with both hard assertions and weighted score output

#### Acceptance Criteria
##### Scenario: planning profile scores a plan case
**Given** a planning skill case  
**When** scoring runs  
**Then** profile defaults evaluate routing, process, and outcome  
**And** skill-specific assertions can extend the result

##### Scenario: hard assertions fail regardless of soft score
**Given** a case that violates a forbidden action  
**When** scoring runs  
**Then** the case fails immediately  
**And** the weighted score is still reported for diagnostics

### W-000010 — Emit JSON-first reports with optional HTML views `[AFK]`
#### User Story
**ID:** W-000010

As a framework user, I want machine-readable results and a human-friendly report view so that CI automation and debugging both work well.

#### Dependencies
- Depends on: W-000007, W-000009
- Blocks: W-000011, W-000013
- Milestone checkpoint: canonical JSON report is stable enough for CLI consumption; HTML can remain optional in the sprint if JSON is solid

#### Acceptance Criteria
##### Scenario: JSON report emitted
**Given** a completed test run  
**When** reporting executes  
**Then** a canonical JSON artifact is written  
**And** it includes tiers, thresholds, trial stats, and trace links

##### Scenario: HTML view generated
**Given** a JSON report  
**When** HTML rendering is requested  
**Then** a browsable summary page is produced

---

## Wave 4 — CLI, Parity, and Pilot Skills
**Sprint:** Sprint 4 (2026-06-08 → 2026-06-19, 10 days)  
**Milestone:** **M4** — a usable CLI validates the pilot cohort and reveals remaining v1 gaps.

### W-000011 — Ship library-backed CLI commands `[AFK]`
#### User Story
**ID:** W-000011

As a developer, I want a CLI wrapper over the framework library so that I can list, validate, and test skills in local dev and CI.

#### Dependencies
- Depends on: W-000003, W-000004, W-000005, W-000010
- Blocks: W-000012, W-000013
- Milestone checkpoint: `list`, `validate`, and `test` flow through the same library APIs used by programmatic callers

#### Acceptance Criteria
##### Scenario: local skill repo tested from CLI
**Given** a local repo path  
**When** I run `arc-skill-eval test <path>`  
**Then** the framework discovers participating skills and executes the requested cases

##### Scenario: remote repo tested from CLI
**Given** a git repo ref  
**When** I run `arc-skill-eval test github:owner/repo@ref`  
**Then** the framework clones the repo and executes the requested cases

### W-000012 — Add CLI golden parity cases `[AFK]`
#### User Story
**ID:** W-000012

As a maintainer, I want a small CLI parity subset per skill so that SDK-vs-CLI drift is caught without duplicating the full suite.

#### Dependencies
- Depends on: W-000007, W-000011
- Blocks: W-000013
- Milestone checkpoint: parity mismatches are visible at case level and do not require inspecting raw logs first

#### Acceptance Criteria
##### Scenario: golden parity subset passes
**Given** a skill with parity cases  
**When** the parity lane runs  
**Then** the CLI JSON run produces an equivalent normalized trace  
**And** parity mismatches are surfaced clearly

### W-000013 — Onboard representative pilot skills `[HITL]`
#### User Story
**ID:** W-000013

As a maintainer, I want the framework proven against one planning skill, one repo-mutation skill, and one external-api skill so that v1 architecture is validated across key profile types.

#### Dependencies
- Depends on: W-000008, W-000011, W-000012
- Final milestone checkpoint: pilot skill owners confirm fixture quality, credential handling, and target tier expectations

#### Acceptance Criteria
##### Scenario: pilot cohort is green
**Given** the representative pilot cohort  
**When** their managed eval suites run  
**Then** each skill reaches its declared target tier or reports the exact gap

#### Initial Pilot Cohort
- `arc-planning-work`
- `arc-conventional-commits`
- `arc-linear-issue-creator`

---

## Milestone Exit Gates
- **M0:** release plumbing is reviewable and the root plan is execution-ready.
- **M1:** discovery + validation work against at least one adjacent skill/eval pair.
- **M2:** Pi SDK run + telemetry + trace normalization exist for one deterministic case.
- **M3:** fixture materialization, scoring, and JSON reporting work together end-to-end.
- **M4:** CLI exercises the pilot cohort and reveals remaining parity or coverage gaps before v1 hardening.

## Exit Criteria for “Ready to Draft v1”
Before the v1 spec is considered execution-ready at framework level:
- Root development plan saved and kept current
- Root conventional commits plan saved
- Semantic-release baseline installed
- Release workflow added and reviewed
- Repo initialized on `main`
- Initial release strategy for `0.1.0` documented
- At least one contract validation vertical slice implemented in `src/`

## Immediate Next Artifacts
1. Implement `src/load/local-loader.ts` for adjacent skill discovery
2. Add contract normalization alongside validation
3. Add fixture-backed validator examples/tests
4. Stub CLI `list` and `validate` flows over the contract layer
