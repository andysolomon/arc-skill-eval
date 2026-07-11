## Implementation Plan

**Story:** W-000047 — Architecture: deepen Pi SDK runner module (#142)  
**Branch:** `feat/W-000047-deepen-pi-sdk-runner`

## 1. Product goal and scope boundaries

Turn `src/pi/sdk-runner.ts` into a stable orchestration façade whose internal collaborators own cohesive concerns. Preserve `runPiSdkCase`, `PiSdkSessionFactory`, all observable execution behavior, and persisted schemas.

This is an internal responsibility refactor. It does not redesign runtime input contracts, remove legacy lanes, alter assertion behavior, or introduce public APIs merely to meet a size target.

## 2. Current baseline

- `src/pi/sdk-runner.ts` coordinates session execution and also contains case conversion, environment/fixture lifecycle, context/resource loading, usage normalization, telemetry loading, provider-error detection, and cleanup.
- `src/pi/session-adapter.ts` already owns Pi bootstrap from W-000046; `sdk-runner.ts` no longer directly calls `AuthStorage.create` or `createAgentSession`.
- Current callers rely on `runPiSdkCase` and the injectable `PiSdkSessionFactory` through `src/runtime/pi-sdk.ts`, `src/evals/run-case.ts`, and tests.
- `tests/pi-sdk-runner.test.mjs` covers lane flattening, environment cleanup, run capture, shared environments, fixture isolation, and provider errors. Sandbox and runtime behavior are also covered by `tests/just-bash-sandbox.test.mjs` and `tests/agent-runtime.test.mjs`.

## 3. Missing capabilities

- There is no clear internal owner for case mapping and selection.
- Environment creation, fixture materialization, and cleanup are distant from their lifecycle boundary.
- Context/resource loading and manifest assembly are embedded in the runner façade.
- Usage, terminal-error, event, and telemetry normalization obscure the central run flow.
- Extracting these concerns must not accidentally expand `src/pi/index.ts` or change existing exports.

## 4. Milestones and tasks

### Milestone 1 — Freeze the façade and responsibility map

**Goal:** Establish behavior and export constraints before moving code.

**Deliverables**

- [ ] Record the existing exports from `src/pi/sdk-runner.ts` and `src/pi/index.ts` used by production callers and tests.
- [ ] Group private helpers into case mapping, lifecycle, context loading, and run observation responsibilities.
- [ ] Add or strengthen characterization tests only where current cleanup, provider-error, manifest, or sandbox behavior is not protected.

**Files:** `src/pi/sdk-runner.ts`, `src/pi/index.ts`, `src/pi/types.ts`, `tests/pi-sdk-runner.test.mjs`

**Dependencies:** W-000046 is complete.

**Risks:** Moving types with functions can accidentally change public import paths. Keep façade re-exports only where they already exist.

**Acceptance criteria:** Existing façade signatures and injection behavior are explicit and protected.

### Milestone 2 — Extract case mapping and lifecycle collaborators

**Goal:** Localize pure case conversion and owned-resource cleanup.

**Deliverables**

- [ ] Move `collectPiSdkRunnableCases`, `findPiSdkRunnableCase`, case selection, model resolution, and lane conversion helpers into a cohesive internal case-mapping module.
- [ ] Preserve existing façade exports for `collectPiSdkRunnableCases` and `findPiSdkRunnableCase` if current callers/tests import them there.
- [ ] Move `createPiSdkRunEnvironment`, fixture materialization/snapshotting, case cleanup, and skill cleanup into an internal lifecycle module.
- [ ] Preserve fresh fixture workspaces, shared-environment behavior, idempotent cleanup, and cleanup on session-creation failure.

**Files:** `src/pi/sdk-runner.ts`, new internal files under `src/pi/`, `src/pi/types.ts`, `tests/pi-sdk-runner.test.mjs`

**Dependencies:** Milestone 1.

**Risks:** Cleanup ownership spans environment and fixture resources. Preserve ordering and swallowed-cleanup-error behavior exactly.

**Acceptance criteria:** The façade delegates mapping and lifecycle work; focused tests remain green.

### Milestone 3 — Extract context and observation collaborators

**Goal:** Make the run coordinator read as prepare → create session → prompt → assemble result → enforce terminal errors.

**Deliverables**

- [ ] Move resource-loader creation, explicit/ambient skill loading, skill deduplication, and context-manifest assembly into an internal context module.
- [ ] Keep sandbox tool selection at the session boundary while moving only cohesive helper construction where useful; do not change `just-bash` routing.
- [ ] Move usage normalization, model/thinking inference, event guards/snapshots, telemetry loading, and terminal provider-error inspection into one or more cohesive internal observation helpers.
- [ ] Keep default session creation routed through `src/pi/session-adapter.ts`.

**Files:** `src/pi/sdk-runner.ts`, new internal files under `src/pi/`, `src/pi/session-adapter.ts` (call-site regression only), `tests/pi-sdk-runner.test.mjs`, `tests/just-bash-sandbox.test.mjs`

**Dependencies:** Milestone 2.

**Risks:** Context manifests and usage fields are persisted downstream. Refactor without renaming or default-value changes.

**Acceptance criteria:** Each extracted module has one documented owner; `runPiSdkCase` remains the stable coordinator.

### Milestone 4 — Verify boundaries and behavior

**Goal:** Prove this is a behavior-preserving internal refactor.

**Deliverables**

- [ ] Run focused runner, runtime, and sandbox tests.
- [ ] Run `npm run typecheck` and full offline `npm test`.
- [ ] Run structural checks for forbidden direct Pi bootstrap and inspect exports/import graph.
- [ ] Review generated artifact/trace fixtures or assertions for schema drift.

**Verification commands**

```sh
node --test tests/pi-sdk-runner.test.mjs tests/just-bash-sandbox.test.mjs tests/agent-runtime.test.mjs
npm run typecheck
npm test
rg 'AuthStorage\.create|createAgentSession' src/pi/sdk-runner.ts
```

The final `rg` must return no matches.

## 5. Test strategy

- **Unit/characterization:** `tests/pi-sdk-runner.test.mjs` for case mapping, lifecycle, session capture, provider errors, context manifest, and usage behavior.
- **Integration:** `tests/agent-runtime.test.mjs` for the runtime adapter and `tests/just-bash-sandbox.test.mjs` for sandbox routing.
- **Full regression:** `npm test`, offline only.
- **Structural:** inspect `src/pi/index.ts`; no new helper API is exported without an existing caller. Confirm preserved signatures through typecheck.
- **Manual QA:** not required; inspect the coordinator flow and diff for responsibility locality.

## 6. Acceptance-criteria mapping

| Criterion | Milestone(s) | Verification |
| --- | --- | --- |
| Cohesive internal modules with runner coordinator | 1–3 | Diff/import review and focused tests |
| Preserve `runPiSdkCase` / `PiSdkSessionFactory` | 1, 4 | Typecheck and caller tests |
| No premature public APIs | 1, 4 | `src/pi/index.ts` export review |
| Preserve lifecycle, sandbox, context, telemetry, usage, errors | 2–4 | Focused tests and full suite |
| Continue shared session adapter | 3, 4 | Structural `rg` and adapter tests |

## 7. Out of scope / deferred

- Eval-native runtime input and legacy tunnel removal (W-000051).
- Artifact, trace, replay, or benchmark schema changes.
- Removal of routing, parity, live-smoke, or legacy contract lanes.
- Numeric source-line targets.

## 8. Risks and notes

- The worktree contains unrelated skill-file changes; implementation must not stage, overwrite, or clean them.
- `src/pi/index.ts` wildcard exports can expose new modules accidentally if directory-level export patterns change.
- A smaller façade is expected, but locality and behavior—not line count—determine acceptance.

## 9. Immediate next steps

1. Create `feat/W-000047-deepen-pi-sdk-runner` from the latest default branch.
2. Run baseline focused tests and record current exports.
3. Implement milestones in order, keeping each extraction behavior-neutral.
4. Complete independent review before opening the one-issue PR with `Closes #142`.
