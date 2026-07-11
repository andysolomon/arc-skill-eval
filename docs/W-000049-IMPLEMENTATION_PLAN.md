## Implementation Plan

**Story:** W-000049 — Architecture: collapse run command orchestration into eval pipeline (#144)  
**Branch:** `feat/W-000049-extract-eval-case-pipeline`

## 1. Product goal and scope boundaries

Extract a protocol-neutral per-case pipeline that owns execution, grading, artifact writing, observability export, cleanup, compare sequencing, and case-result assembly. Keep `runEvalsCommand` responsible for discovery, preflight, filtering, progress, and benchmark aggregation; keep the TUI calling `runEvalsCommand`.

Preserve fail-fast compare behavior, artifact/trace schemas, progress timing, and process-level sink lifecycle. Do not reopen closed W-000048 reader work without evidence of actual drift.

## 2. Current baseline

- `src/cli/run-evals-command.ts` owns both command concerns and `runOneCase` / `runOneCaseVariant` lifecycle logic.
- A variant currently runs `runEvalCase` → `gradeEvalCase` → `writeCaseVariantArtifacts` → sink export, with `run.cleanup()` in `finally`.
- Compare mode awaits `with_skill`, then `without_skill`; failure stops subsequent execution and is recorded by the command's case-level error path.
- Sink export failures are converted to per-sink results; process-level sink shutdown is owned outside this function.
- `src/tui/run-driver.ts` already calls `runEvalsCommand` and should continue to do so.
- W-000048 already centralized artifact writing in `src/evals/artifacts.ts`.

## 3. Missing capabilities

- The command layer owns a cohesive per-case lifecycle that is not independently testable.
- Moving flat command options unchanged would recreate a shallow option mirror rather than a domain boundary.
- Compare failure, cleanup ordering, and sink-failure isolation need explicit regression tests before extraction.
- Result types currently declared in the CLI module may have import compatibility considerations.

## 4. Milestones and tasks

### Milestone 1 — Characterize lifecycle semantics and define domain inputs

**Goal:** Freeze current behavior and design a cohesive pipeline contract.

**Deliverables**

- [ ] Add characterization tests for single-case sequencing, cleanup after grading/write/export failure, sink isolation, compare order, and compare fail-fast behavior.
- [ ] Define cohesive inputs for case specification, execution configuration, output/run context, and focused dependencies (`AgentRuntime`, `LlmJudgeFn`, `PiSdkSessionFactory`).
- [ ] Define complete case/variant result types in the eval layer; preserve existing import compatibility through deliberate re-exports where required.
- [ ] Keep CLI/TUI/global option parsing out of the pipeline API.

**Files:** new `src/evals/case-pipeline.ts` (name flexible), `src/cli/run-evals-command.ts`, new pipeline tests, existing command tests

**Dependencies:** W-000048 complete; W-000050 merged first.

**Risks:** Over-grouped inputs can hide required state; flat mirroring recreates the current problem. Use domain ownership, not arbitrary nesting.

**Acceptance criteria:** Another caller can execute a prepared case without importing CLI or TUI concerns.

### Milestone 2 — Move the complete per-case lifecycle

**Goal:** Give the pipeline sole ownership of execution through result assembly.

**Deliverables**

- [ ] Move single/compare case orchestration and variant directory selection into the pipeline.
- [ ] Move variant execution, judge-model fallback, grading, artifact persistence, per-case sink export, and artifact result assembly.
- [ ] Keep cleanup in `finally` after every downstream consumer that needs the workspace.
- [ ] Move comparison pass-rate assembly while preserving sequential `with_skill` → `without_skill` execution.
- [ ] Preserve fail-fast behavior: do not start a later variant after an earlier failure and do not synthesize partial success/comparison results.
- [ ] Preserve already-written artifacts when a later stage or variant fails.

**Files:** `src/evals/case-pipeline.ts`, `src/cli/run-evals-command.ts`, `src/evals/artifacts.ts` (consumer only), observability types/modules (consumer only), pipeline tests

**Dependencies:** Milestone 1.

**Risks:** Cleanup too early breaks artifact copying/grading; cleanup too late leaks temporary workspaces. Compare errors must continue to reach command-owned error recording.

**Acceptance criteria:** No duplicate per-case lifecycle remains in the command.

### Milestone 3 — Reduce command and preserve TUI/aggregation boundaries

**Goal:** Make the command discover, prepare, invoke, report, and aggregate—without executing lifecycle internals.

**Deliverables**

- [ ] Replace command-local lifecycle calls with the pipeline API.
- [ ] Keep discovery, eval loading, case/skill filtering, model/agent-dir preflight, output-root resolution, and progress callbacks in `runEvalsCommand`.
- [ ] Keep benchmark JSON construction/writing, aggregate summaries, and observability failure collection at their current run/command ownership level unless the latter consumes pipeline results only.
- [ ] Preserve progress-event order and case-level error recording.
- [ ] Leave `src/tui/run-driver.ts` calling `runEvalsCommand`; change it only if a regression test requires a compatibility import update.

**Files:** `src/cli/run-evals-command.ts`, `src/tui/run-driver.ts` (normally unchanged), `tests/evals-run-command.test.mjs`, `tests/tui-run-driver.test.mjs`

**Dependencies:** Milestone 2.

**Risks:** Moving event emission into the pipeline would couple it to UX and alter event timing. Keep progress command-owned.

**Acceptance criteria:** CLI and TUI behavior remain unchanged and no second orchestration path appears.

### Milestone 4 — Verify boundaries, failure semantics, and compatibility

**Goal:** Prove one lifecycle owner and no persisted/user-visible drift.

**Deliverables**

- [ ] Run focused pipeline, command, artifact, run-case, and TUI tests.
- [ ] Run `npm run typecheck` and full offline `npm test`.
- [ ] Confirm command no longer defines the old per-case helpers and the pipeline has no CLI/TUI imports.
- [ ] Compare artifact and progress-event assertions against baseline.

**Verification commands**

```sh
node --test tests/evals-run-command.test.mjs tests/evals-run-case.test.mjs tests/evals-artifacts.test.mjs tests/tui-run-driver.test.mjs
npm run typecheck
npm test
rg 'function runOneCase|function runOneCaseVariant|function exportCaseVariantToSinks' src/cli/run-evals-command.ts
rg 'src/cli|src/tui|run-evals-command|run-driver' src/evals/case-pipeline.ts
```

Both structural searches must return no matches.

## 5. Test strategy

- **Unit:** new pipeline tests with injected runtime/judge/session seams for sequencing, cleanup, sink isolation, and compare behavior.
- **Integration:** `tests/evals-run-command.test.mjs` for discovery/preflight/progress/error/benchmark behavior.
- **Artifact:** `tests/evals-artifacts.test.mjs` verifies unchanged round trips and paths.
- **TUI:** `tests/tui-run-driver.test.mjs` verifies the command-backed run path and events.
- **Full regression:** `npm test`, offline only.

## 6. Acceptance-criteria mapping

| Criterion | Milestone(s) | Verification |
| --- | --- | --- |
| Pipeline owns complete per-case lifecycle | 1, 2 | Pipeline tests and command structural search |
| Cohesive UI-independent inputs | 1, 4 | Type/import review and structural search |
| Command retains discovery/preflight/progress/aggregation | 3 | Command integration tests |
| TUI continues through command | 3, 4 | TUI import review/tests |
| Preserve sequential fail-fast compare | 1, 2, 4 | Explicit pipeline tests |
| Preserve sink failure isolation and shutdown boundary | 2–4 | Sink tests and ownership review |

## 7. Out of scope / deferred

- TUI artifact reader migration; file separate work only if actual schema duplication/drift is demonstrated.
- Compare-mode partial-success or parallel execution improvements.
- Process-level observability sink shutdown.
- Artifact/trace schema changes and numeric line-count targets.

## 8. Risks and notes

- W-000050 must land first so judge classification no longer remains command-local during extraction.
- Existing exported result types may be consumed by tests or internal modules; preserve compatibility intentionally.
- The unrelated dirty worktree must not be cleaned or included.

## 9. Immediate next steps

1. Merge W-000050.
2. Create `feat/W-000049-extract-eval-case-pipeline` from the updated default branch.
3. Add lifecycle characterization tests, then implement milestones in order.
4. Open one PR with `Closes #144` after independent review and all offline gates.
