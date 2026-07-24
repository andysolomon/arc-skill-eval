# ADR-0007: Multi-harness CLI runtimes with BYOK

## Status

Accepted (2026-07-24)

## Context

[ADR-0001](./ADR-0001-defer-agent-runtime-expansion.md) shipped a minimal `AgentRuntime` seam (`id` + `runCase`) with Pi SDK as the only production implementation and deferred CLI `--runtime` selection plus additional adapters until there was concrete demand for a non-Pi path.

That demand is now clear:

- Users who already run Codex, Claude Code, Cursor Agent, or Copilot CLI should not be forced to install and configure Pi to grade skills.
- Users must bring their own API keys / tokens (BYOK) via environment variables.
- Building a custom in-process agent loop (Option B in [agent-runtime-strategy.md](../agent-runtime-strategy.md)) would diverge from the agents users actually use and weaken the with/without skill signal.

Eval-owned Pi `--agent-dir` (Option A) remains valuable for Pi users and CI reproducibility; it is complementary, not a substitute for harness adapters.

## Decision

1. **Supersede ADR-0001’s deferral of additional runtimes and CLI `--runtime`.** The minimal seam decision and Pi-as-default remain in force.
2. **Add CLI-spawn `AgentRuntime` adapters** for external harnesses: `codex`, `claude-code`, `cursor-agent`, and `copilot` (all shipped behind `--runtime`).
3. **Authenticate with BYOK env vars** (or harness-native login). Never accept keys as CLI flags; never write keys into artifacts or observability sinks.
4. **Stage skills** into each harness’s conventional discovery directory inside the prepared workspace (`attachSkill: false` skips the target skill).
5. **Normalize vendor JSON/JSONL** into `EvalTrace` (expand `EvalTraceRuntime`) and keep Pi’s result shape as an adapter-local compatibility boundary until a fuller neutral `RuntimeCaseResult` lands.
6. **Do not** pursue a custom OpenAI-compatible tool-loop runtime as the escape hatch in this effort.

## Consequences

- **Positive:** Users without Pi can run the same `evals.json` suites; cross-harness comparison becomes possible; CI can pin a harness + env key.
- **Positive:** Product focus stays on eval authoring/grading rather than re-implementing coding agents.
- **Negative:** Trace fidelity and skill-auto-selection vary by vendor; behavior asserts need honest capability notes until trace grading is complete.
- **Negative:** Each adapter must track CLI flag and event-schema churn.
- **Neutral:** Pi remains the default `pi-sdk` runtime; docs must list per-runtime binary + env requirements.

## References

- [multi-harness-runtimes.md](../multi-harness-runtimes.md)
- [agent-runtime-strategy.md](../agent-runtime-strategy.md)
- [ADR-0001](./ADR-0001-defer-agent-runtime-expansion.md)
