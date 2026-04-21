# Framework Repo Structure Draft

## Goal
Organize `arc-skill-eval` as a single TypeScript package with clean internal boundaries so it can ship quickly as a library + CLI while remaining extractable later.

## Package Shape
- One root `package.json`
- One root `tsconfig.json`
- Library-first internal architecture
- Thin CLI wrapper over library APIs

## Proposed Top-Level Tree

```text
arc-skill-eval/
├── docs/
│   ├── skill-evals-v1.md
│   ├── framework-repo-structure.md
│   ├── skill-eval-schema.md
│   └── domain-model.md
├── src/
│   ├── index.ts
│   ├── cli/
│   │   └── index.ts
│   ├── load/
│   │   ├── local-loader.ts
│   │   ├── git-loader.ts
│   │   ├── source-types.ts
│   │   └── discover-skills.ts
│   ├── contracts/
│   │   ├── types.ts
│   │   ├── normalize.ts
│   │   ├── validate.ts
│   │   └── case-ids.ts
│   ├── pi/
│   │   ├── index.ts
│   │   ├── types.ts
│   │   ├── sdk-runner.ts
│   │   ├── cli-runner.ts
│   │   ├── observer-extension.ts
│   │   ├── session-telemetry.ts
│   │   └── model-selection.ts
│   ├── traces/
│   │   ├── types.ts
│   │   ├── normalize-sdk.ts
│   │   ├── normalize-cli-json.ts
│   │   └── merge-telemetry.ts
│   ├── fixtures/
│   │   ├── materialize.ts
│   │   ├── workspace.ts
│   │   ├── git-state.ts
│   │   ├── mock-servers.ts
│   │   ├── cli-shims.ts
│   │   └── shared/
│   ├── scorers/
│   │   ├── engine.ts
│   │   ├── hard-assertions.ts
│   │   ├── weights.ts
│   │   ├── assertions/
│   │   │   ├── declarative.ts
│   │   │   └── custom.ts
│   │   └── profiles/
│   │       ├── planning.ts
│   │       ├── repo-mutation.ts
│   │       ├── external-api.ts
│   │       └── orchestration.ts
│   ├── tiers/
│   │   ├── types.ts
│   │   ├── compute-achieved-tier.ts
│   │   └── enforcement.ts
│   ├── reporting/
│   │   ├── json-report.ts
│   │   ├── html-report.ts
│   │   ├── baseline.ts
│   │   └── model-fingerprint.ts
│   ├── rubric/
│   │   ├── types.ts
│   │   └── extension-point.ts
│   └── util/
│       ├── fs.ts
│       ├── git.ts
│       ├── hash.ts
│       └── paths.ts
├── fixtures/
│   ├── repos/
│   ├── docs/
│   └── api/
├── scripts/
└── test-results/
```

## Directory Responsibilities

### `docs/`
Holds the written design artifacts and evolving standards.

### `src/load/`
Responsible for:
- loading repos from disk or git refs
- discovering adjacent `SKILL.md` + `skill.eval.ts`
- returning raw loaded modules and file metadata

### `src/contracts/`
Responsible for:
- runtime types
- validation
- normalization into the internal contract shape
- stable case IDs and derived fingerprints

### `src/pi/`
Pi-native execution layer.

Responsibilities:
- Pi SDK canonical runner
- Pi CLI JSON parity runner
- observer extension
- session-entry telemetry loading
- model selection and model fingerprinting

### `src/traces/`
Turns Pi runtime output into canonical normalized traces.

Responsibilities:
- normalize SDK events
- normalize CLI JSON events
- merge session-entry telemetry
- attach raw debug payloads

### `src/fixtures/`
Builds hermetic workspaces and runtime dependencies.

Responsibilities:
- snapshot copy into temp workspace
- first-class git state initialization
- mock servers
- CLI shims
- shared reusable fixture assets

### `src/scorers/`
Evaluates traces and workspace outcomes.

Responsibilities:
- hard assertion handling
- weighted score aggregation
- declarative assertion execution
- typed custom assertion invocation
- profile default scorer packs

### `src/tiers/`
Computes and enforces maturity semantics.

Responsibilities:
- target vs achieved tier comparison
- missing requirement reporting
- tier enforcement policy

### `src/reporting/`
Produces outputs for CI and humans.

Responsibilities:
- canonical JSON artifact
- optional HTML report rendering
- baseline comparison
- model-aware reporting

### `src/rubric/`
Optional rubric extension point, intentionally lightweight in v1.

Responsibilities:
- rubric interface types
- placeholder extension APIs
- no required backend in v1

### `fixtures/`
Framework-owned shared fixtures reusable across skill repos.

Examples:
- tiny TypeScript repo
- frozen issue payloads
- fake Linear API fixtures
- deterministic docs/PRD snapshots

---

## Export Surface

## Library Exports
Initial package exports should likely include:
- repo/source loaders
- skill discovery
- contract validation and normalization
- Pi SDK runner
- Pi CLI parity runner
- trace normalization
- fixture materialization
- scorer engine
- report generation

Illustrative barrel exports:

```ts
export * from "./load/source-types";
export * from "./load/local-loader";
export * from "./load/git-loader";
export * from "./contracts/types";
export * from "./contracts/validate";
export * from "./traces/types";
export * from "./scorers/engine";
export * from "./reporting/json-report";
```

## CLI Commands
Initial CLI should be thin wrappers over library APIs:

```bash
arc-skill-eval list <repo-or-path>
arc-skill-eval validate <repo-or-path>
arc-skill-eval test <repo-or-path>
arc-skill-eval test <repo-or-path> --skill <name>
arc-skill-eval report <results.json>
```

---

## Recommended Build Order

### Phase 1 — Documents and Contract Layer
1. `docs/skill-evals-v1.md`
2. `docs/skill-eval-schema.md`
3. `src/contracts/types.ts`
4. `src/contracts/validate.ts`
5. `src/load/local-loader.ts`

### Phase 2 — Pi Execution Core
6. `src/pi/sdk-runner.ts`
7. `src/pi/observer-extension.ts`
8. `src/pi/session-telemetry.ts`
9. `src/traces/normalize-sdk.ts`

### Phase 3 — Fixtures and Scoring
10. `src/fixtures/materialize.ts`
11. `src/fixtures/git-state.ts`
12. `src/scorers/engine.ts`
13. profile scorer packs

### Phase 4 — CLI and Reports
14. `src/cli/index.ts`
15. `src/reporting/json-report.ts`
16. `src/reporting/html-report.ts`
17. `src/pi/cli-runner.ts`

### Phase 5 — Git Loader and Pilot Skills
18. `src/load/git-loader.ts`
19. pilot repo integration and fixture authoring
20. CLI parity golden subset

---

## Why This Structure
This structure intentionally optimizes for:
- **Pi-native depth now**
- **fast path to a working CLI**
- **clear ownership boundaries**
- **easy extraction later if desired**

It avoids:
- premature monorepo/workspace complexity
- over-generic multi-harness abstractions in v1
- mixing framework responsibilities into skill repos

---

## Likely Near-Term Additions
After the first working slice, likely additions include:
- richer baseline storage
- historical trend views
- more fixture helper libraries
- live-smoke credential helpers
- optional rubric backend adapters
