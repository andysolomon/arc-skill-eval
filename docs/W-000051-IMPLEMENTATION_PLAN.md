## Implementation Plan

**Story:** W-000051 — Architecture: retire legacy contract tunnel in run-case (#146)  
**Branch:** `feat/W-000051-eval-native-runtime-input`

## 1. Product goal and scope boundaries

Audit the standard eval-to-runtime boundary and, only on a documented GO decision, replace synthetic legacy profile/tier/routing input with a protocol-neutral eval-native execution input. Translate to Pi-specific configuration at `src/runtime/pi-sdk.ts` while preserving `runPiSdkCase`, legacy lanes, session injection, and all persisted trace/replay/artifact schemas.

This issue is conditional. A NO-GO audit is a valid outcome and must stop implementation rather than forcing an additional conversion layer.

## 2. Current baseline

- `src/evals/run-case.ts::buildSkillDiscovery` calls `normalizeSkillEvalContract` with synthetic `profile: "repo-mutation"`, `targetTier: 1`, and empty routing for standard `evals.json` cases.
- `src/runtime/types.ts` currently aliases Pi runner option/result types, so the nominal runtime seam is Pi-shaped.
- `src/runtime/pi-sdk.ts` is currently a thin identity adapter that forwards directly to `runPiSdkCase`.
- `PiSdkCaseRunResult`, trace normalization, replay, telemetry, routing, parity, and live-smoke lanes still consume contract/lane metadata.
- Persisted trace identity and replay compatibility must remain unchanged even if standard runtime input becomes neutral.
- W-000047 must first stabilize the Pi runner façade.

## 3. Missing capabilities

- There is no audited inventory distinguishing genuine legacy-lane requirements from standard-path placeholders.
- Standard eval orchestration cannot invoke an `AgentRuntime` without constructing `ValidatedSkillDiscovery.contract` and `PiSdkExecutionCase` metadata.
- The Pi boundary does not currently own translation from neutral execution data to Pi compatibility metadata.
- The change lacks an explicit simplicity/deletion gate to prevent parallel type hierarchies and adapter churn.

## 4. Milestones and tasks

### Milestone 1 — Complete the contract/caller audit and decide GO or NO-GO

**Goal:** Prove whether a neutral boundary reduces coupling without persisted-schema or façade changes.

**Deliverables**

- [ ] Inventory production/test uses of `NormalizedSkillEvalContract`, `ValidatedSkillDiscovery.contract`, `.profile`, `.targetTier`, `PiSdkRunnableCase` kind/lane, `RuntimeCaseOptions`, `RuntimeCaseResult`, and `PiSdkSessionFactory`.
- [ ] Classify each use as standard eval input, legacy routing/parity/live-smoke lane, Pi adapter compatibility, trace/replay compatibility, telemetry metadata, or removable coupling.
- [ ] Trace result data through `src/traces/normalize-sdk.ts`, `src/runtime/replay.ts`, observability artifacts, and benchmark consumers.
- [ ] Specify the minimum neutral input and the exact compatibility metadata synthesized at the Pi adapter.
- [ ] Record GO/NO-GO in issue #146 before code changes.

**Files:** `src/contracts/`, `src/load/source-types.ts`, `src/evals/run-case.ts`, `src/runtime/`, `src/pi/`, `src/traces/`, related tests

**Dependencies:** W-000047 merged.

**GO criteria**

1. Standard input needs only real identity/prompt/skill/files plus execution options—no placeholder profile/tier/routing/lane.
2. Translation is localized to `src/runtime/pi-sdk.ts`.
3. `runPiSdkCase` and `PiSdkSessionFactory` remain stable.
4. Trace, replay, artifact, grading, timing, context-manifest, tool-summary, and benchmark schemas remain unchanged.
5. Legacy contracts remain localized to genuine legacy lanes/adapters.
6. The resulting dependency graph is simpler than the current tunnel.

**NO-GO triggers**

- An unclassified caller requires legacy fields on the neutral path.
- Neutral input still needs synthetic profile/tier/routing values.
- The public runner façade or persisted schemas must change.
- More conversion layers/types are added than removed.

**Acceptance criteria:** A cited caller matrix and explicit decision are posted. On NO-GO, stop and update/defer/close the issue.

### Milestone 2 — Define protocol-neutral runtime input (GO only)

**Goal:** Represent standard eval execution without Pi or normalized-contract requirements.

**Deliverables**

- [ ] Add an eval-native execution case type containing real case id, prompt, and skill identity in `src/evals/types.ts` or an appropriately owned eval module.
- [ ] Replace Pi aliases in `src/runtime/types.ts` with the minimum protocol-neutral input required by `AgentRuntime` while retaining focused test injection.
- [ ] Keep result compatibility sufficient for existing timing, trace, manifest, tool-summary, and cleanup assembly; avoid broad result redesign unless the audit proves it necessary.
- [ ] Document the boundary and invariants in module comments.

**Files:** `src/evals/types.ts`, `src/runtime/types.ts`, related type tests/compile callers

**Dependencies:** Milestone 1 GO.

**Risks:** A supposedly neutral type can still leak `PiSdkSessionFactory`; retain the focused injection seam without claiming every runtime must use it, or isolate Pi-only dependencies in adapter configuration as the audit dictates.

**Acceptance criteria:** Standard input has no normalized contract or Pi lane requirement.

### Milestone 3 — Move Pi translation to the runtime adapter (GO only)

**Goal:** Make eval orchestration protocol-neutral and Pi adaptation explicit.

**Deliverables**

- [ ] Replace `buildSkillDiscovery` contract normalization and `buildExecutionCase` Pi-lane construction in `src/evals/run-case.ts` with native execution input.
- [ ] Expand `src/runtime/pi-sdk.ts` to translate native input into the preserved `runPiSdkCase` options, including named compatibility metadata needed by unchanged trace/replay output.
- [ ] Keep `runPiSdkCase` focused on Pi execution; do not make it accept a native/legacy union solely for this issue.
- [ ] Adapt `src/runtime/replay.ts` to the neutral runtime interface while returning compatible runtime results.
- [ ] Leave routing/parity/live-smoke collection and contracts behind their existing Pi/legacy paths.

**Files:** `src/evals/run-case.ts`, `src/runtime/pi-sdk.ts`, `src/runtime/replay.ts`, `src/runtime/types.ts`, `src/pi/types.ts` (compatibility only), `src/traces/normalize-sdk.ts` (regression only)

**Dependencies:** Milestone 2.

**Risks:** Trace identity currently derives profile/tier/kind/lane from Pi-shaped results. Compatibility defaults must be explicitly adapter-owned and must not leak back into neutral input.

**Acceptance criteria:** The standard eval path contains no synthetic normalization; only the Pi adapter translates.

### Milestone 4 — Verify deletion, compatibility, and offline behavior (GO only)

**Goal:** Demonstrate net simplification with no observable schema change.

**Deliverables**

- [ ] Add tests proving neutral input forwarding and Pi adapter translation.
- [ ] Assert trace identity still records runtime, skill name, and case id and retained compatibility fields remain stable.
- [ ] Run focused run-case, runtime, runner, trace, replay, artifact, and command tests.
- [ ] Run `npm run typecheck` and full offline `npm test`.
- [ ] Run structural searches and review the dependency graph against the GO criteria.

**Verification commands**

```sh
node --test tests/evals-run-case.test.mjs tests/agent-runtime.test.mjs tests/pi-sdk-runner.test.mjs tests/trace-normalization.test.mjs tests/replay-runtime.test.mjs tests/evals-artifacts.test.mjs tests/evals-run-command.test.mjs
npm run typecheck
npm test
rg 'repo-mutation|targetTier: 1|normalizeSkillEvalContract' src/evals/run-case.ts
```

The final `rg` must return no matches. All tests must run without live model/network access.

## 5. Test strategy

- **Audit evidence:** repository-wide `rg` caller matrix attached to the issue comment.
- **Unit/type:** native case construction and Pi adapter translation tests.
- **Runtime integration:** `tests/evals-run-case.test.mjs`, `tests/agent-runtime.test.mjs`, and `tests/pi-sdk-runner.test.mjs`.
- **Compatibility:** trace normalization, replay runtime, artifacts, and command tests.
- **Full regression:** `npm test`, offline only.
- **Structural:** placeholder search, dependency/import review, and confirmation that legacy contracts remain only in genuine lanes/adapters.

## 6. Acceptance-criteria mapping

| Criterion | Milestone(s) | Verification |
| --- | --- | --- |
| Audit every legacy/runtime/trace caller | 1 | Cited caller matrix and GO/NO-GO comment |
| Proceed only on simplicity/compatibility GO | 1 | Gate review before implementation |
| Eval-native protocol-neutral input | 2 | Type/import review and tests |
| Translation only at Pi adapter | 3, 4 | Call-flow review and structural search |
| Preserve genuine legacy lanes | 1, 3 | Caller matrix and lane tests |
| Preserve behavior and persisted schemas | 3, 4 | Focused compatibility tests and full suite |

## 7. Out of scope / deferred

- Deleting `src/contracts/` or legacy routing/parity/live-smoke lanes.
- Changing `runPiSdkCase` / `PiSdkSessionFactory` façade.
- Persisted artifact, trace, replay, grading, timing, manifest, summary, or benchmark migrations.
- A union input that pushes adaptation into the Pi runner.

## 8. Risks and notes

- This remains speculative until the audit passes; do not interpret a detailed conditional plan as pre-approval of implementation.
- Compatibility metadata may remain in Pi results even though it disappears from standard eval input.
- The unrelated dirty worktree must remain untouched.

## 9. Immediate next steps

1. Merge W-000047.
2. Create `feat/W-000051-eval-native-runtime-input` for durable audit/code work, or perform a read-only audit before branch creation.
3. Post the caller matrix and explicit GO/NO-GO decision to #146.
4. On GO, execute milestones 2–4 and open one PR with `Closes #146`; on NO-GO, stop and update the issue.
