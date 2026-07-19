# ADR-0001: Defer AgentRuntime expansion

## Status

Accepted (2026-07-19)

## Context

`arc-skill-eval` needs a protocol-neutral seam between eval orchestration (`run-case`, grading, artifacts) and whatever agent executes a case. The `AgentRuntime` interface and `runtime` option on `runEvalCase` provide that seam today, with `pi-sdk` as the default implementation.

A broader expansion was considered: multiple runtime implementations (`MiniPiAgentRuntime`, `CustomOpenAiCompatRuntime`), a CLI `--runtime` flag, and a custom OpenAI-compatible tool loop (Option B in [agent-runtime-strategy.md](../agent-runtime-strategy.md)).

The Pi SDK adapter (`piSdkRuntime`) is a thin translation pass — it maps `RuntimeCaseOptions` to `RunPiSdkEvalCaseOptions` and delegates to `runPiSdkEvalCase`. Keeping it in `src/runtime/pi-sdk.ts` added an extra module with no independent logic; its natural home is alongside `toPiSdkEvalCaseOptions` in `src/pi/sdk-eval-case.ts`.

## Decision

1. **Fold `piSdkRuntime` into `src/pi/sdk-eval-case.ts`** alongside `toPiSdkEvalCaseOptions`. Delete `src/runtime/pi-sdk.ts`.
2. **Ship the minimal `AgentRuntime` seam as-is**: `id` + `runCase`, default `pi-sdk`, optional `runtime` injection and `createSession` test hook preserved unchanged.
3. **Defer broader AgentRuntime expansion** — additional runtime implementations, CLI `--runtime` selection, and a custom tool-loop runtime — until Option A (eval-owned Pi agent dir) is fully exercised and there is concrete demand for a non-Pi path.

## Consequences

- **Positive:** Fewer modules; Pi translation and the default runtime live in one place (`sdk-eval-case.ts`). The seam (`types.ts`, `replay.ts`, `run-case` injection) stays intact for future runtimes.
- **Positive:** No persisted-schema migration; `RuntimeCaseResult`, trace identity, and replay consumers are unchanged.
- **Negative:** Adding a second runtime still requires a new adapter module and wiring; no CLI flag yet.
- **Neutral:** Documentation and ADR record the deferral so future work does not re-litigate the scope cut.
