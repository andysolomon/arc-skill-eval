## Implementation Plan

**Story:** W-000050 — Architecture: deepen grader — assertion engine vs judge adapter (#145)  
**Branch:** `feat/W-000050-extract-assertion-engine`

## 1. Product goal and scope boundaries

Create one Pi-free engine that owns all deterministic assertion classification and grading while `gradeEvalCase` remains responsible for judge orchestration, source-order result assembly, and summaries. Preserve `grading.json`, evidence behavior, the existing judge adapter, and prompt/parser exports.

Do not implement new trace-aware behavior/safety semantics or combine this work with the per-case pipeline extraction.

## 2. Current baseline

- `src/evals/grade.ts` contains judge orchestration alongside script and intent assertion dispatch, filesystem reads, workspace path safety, regex/JSON checks, evidence formatting, and assertion summaries.
- Judge session setup already routes through `piJudgeSessionRunner` from `src/pi/session-adapter.ts`.
- `buildJudgePrompt` and `parseJudgeResponse` are already exported and directly tested.
- `src/cli/run-evals-command.ts` independently detects judge assertions during preflight.
- `src/evals/artifacts.ts` has separate deterministic display metadata for loosely typed persisted assertions.
- `tests/evals-grade.test.mjs` covers mixed assertions, deterministic success/failure, traversal safety, judge failures/parsing, empty assertions, and adapter isolation.

## 3. Missing capabilities

- No authoritative classifier is shared by grader and command preflight.
- Deterministic logic cannot be imported/tested as a Pi-free subsystem.
- Classification metadata can drift between runtime grading and persisted-artifact display.
- Existing already-satisfied judge/prompt/parser criteria need regression protection rather than reimplementation.

## 4. Milestones and tasks

### Milestone 1 — Define the assertion-engine contract

**Goal:** Establish one typed classifier and deterministic grading interface.

**Deliverables**

- [ ] Add a dedicated module such as `src/evals/assertion-engine.ts` with module-level ownership documentation.
- [ ] Export a typed classification function that identifies judge assertions and all deterministic script/intent forms.
- [ ] Define a deterministic grading input containing assertion, workspace directory, and assistant text without Pi/session dependencies.
- [ ] Preserve current handling of unsupported behavior, safety, and snapshot-diff assertions as deterministic failed results.

**Files:** `src/evals/assertion-engine.ts`, `src/evals/types.ts`, new or extended focused tests

**Dependencies:** W-000046 is complete.

**Risks:** Persisted artifact assertions are loosely typed; do not make runtime type guards throw on malformed historical JSON.

**Acceptance criteria:** The module imports no Pi/session adapter and represents every non-judge assertion currently accepted by `EvalAssertion`.

### Milestone 2 — Move deterministic grading without semantic drift

**Goal:** Relocate deterministic execution, filesystem safety, and evidence formatting.

**Deliverables**

- [ ] Move script grading (`file-exists`, `regex-match`, `json-valid`) into the engine.
- [ ] Move intent grading (output, workspace, behavior, safety), conversion helpers, path resolution, summaries, and evidence helpers into the engine.
- [ ] Add focused tests for classification, mixed assertion forms, invalid regex/JSON, path traversal, exact output, unsupported forms, and stable evidence/result shapes.
- [ ] Keep network/model dependencies absent from all engine tests.

**Files:** `src/evals/assertion-engine.ts`, `src/evals/grade.ts`, `tests/evals-grade.test.mjs` and/or `tests/evals-assertion-engine.test.mjs`

**Dependencies:** Milestone 1.

**Risks:** Moving helper functions may subtly alter evidence strings or assertion source ordering; characterize before changing.

**Acceptance criteria:** Existing deterministic outcomes and `AssertionResult` shapes remain unchanged.

### Milestone 3 — Re-center `gradeEvalCase` and migrate classification consumers

**Goal:** Leave judge orchestration and final assembly in the grader, with one authoritative classifier.

**Deliverables**

- [ ] Update `gradeEvalCase` to use the shared classifier and deterministic engine while preserving preallocated source-order slots.
- [ ] Keep judge-model resolution, `LlmJudgeFn`, `runJudgeSafely`, default judge construction, result normalization, and summary assembly in `src/evals/grade.ts`.
- [ ] Replace `selectedCasesNeedJudge` duplicate logic in `src/cli/run-evals-command.ts` with the shared classifier.
- [ ] Review `src/evals/artifacts.ts`: consume a safe shared classification helper if it supports unknown JSON, otherwise retain only a documented display adapter that cannot become runtime authority.
- [ ] Preserve `buildJudgePrompt`, `parseJudgeResponse`, and isolated `piJudgeSessionRunner` behavior.

**Files:** `src/evals/grade.ts`, `src/cli/run-evals-command.ts`, `src/evals/artifacts.ts`, `tests/evals-grade.test.mjs`, `tests/evals-run-command.test.mjs`, `tests/evals-artifacts.test.mjs`

**Dependencies:** Milestone 2.

**Risks:** Command preflight uses classification to decide whether judge credentials/model validation is needed; false positives or negatives change user-visible behavior.

**Acceptance criteria:** `gradeEvalCase` remains the orchestrator and all typed runtime classification uses one source.

### Milestone 4 — Verify offline behavior and boundaries

**Goal:** Prove extraction did not alter grading or introduce model calls.

**Deliverables**

- [ ] Run focused engine, grader, command-preflight, and artifact mapping tests.
- [ ] Run `npm run typecheck` and full offline `npm test`.
- [ ] Verify the engine has no Pi imports and duplicate command/grader classifiers are gone.

**Dependencies:** Milestones 1–3 are complete.

**Risks:** A passing extraction can still leave duplicate classification authority or an indirect Pi dependency. Confirm both structural searches and the focused preflight/artifact regressions.

**Acceptance criteria:** Offline verification confirms Pi-free deterministic grading, one authoritative classifier, unchanged grader orchestration, and stable persisted artifact behavior.

**Verification commands**

```sh
node --test tests/evals-grade.test.mjs tests/evals-run-command.test.mjs tests/evals-artifacts.test.mjs
npm run typecheck
npm test
rg '@mariozechner|session-adapter|piJudgeSessionRunner' src/evals/assertion-engine.ts
rg 'function isJudgeAssertion' src/evals/grade.ts src/cli/run-evals-command.ts
```

Both structural searches must return no matches.

## 5. Test strategy

- **Unit:** a focused assertion-engine test file for every classifier branch and deterministic assertion behavior.
- **Integration:** existing `tests/evals-grade.test.mjs` for mixed judge/deterministic ordering, judge failures, summaries, prompt/parser behavior, and adapter isolation.
- **Command regression:** `tests/evals-run-command.test.mjs` for judge preflight decisions.
- **Artifact regression:** `tests/evals-artifacts.test.mjs` for historical/loose assertion display mapping if integration changes.
- **Full regression:** `npm test`, with no live model/network access.

## 6. Acceptance-criteria mapping

| Criterion | Milestone(s) | Verification |
| --- | --- | --- |
| Pi-free engine owns every deterministic form | 1, 2 | Engine tests and import `rg` |
| Authoritative classifier | 1, 3 | Command/grader import review and preflight tests |
| `gradeEvalCase` remains orchestrator | 3 | Existing grader tests and signature review |
| Shared judge adapter remains baseline | 3, 4 | Existing mocked adapter test |
| Prompt/parser exports remain baseline | 3, 4 | Existing direct tests |
| Offline focused/typecheck/full verification | 4 | Commands above |

## 7. Out of scope / deferred

- Implementing trace-aware behavior/safety grading or `snapshot-diff`.
- Changing assertion authoring or `grading.json` schemas.
- Per-case pipeline extraction (W-000049).
- TUI artifact-reader consolidation from closed W-000048.

## 8. Risks and notes

- The command, grader, and artifact viewer consume assertions at different trust levels; runtime authority can be shared without forcing unsafe casts on persisted JSON.
- Preserve exact source ordering when judge and deterministic assertions are interleaved.
- The unrelated dirty worktree must remain untouched.

## 9. Immediate next steps

1. Create `feat/W-000050-extract-assertion-engine` from the latest default branch.
2. Add classifier/engine characterization tests before moving logic.
3. Complete milestones in order and run all offline gates.
4. Open one PR with `Closes #145`; merge before starting W-000049.
