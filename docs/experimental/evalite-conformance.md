# Experimental: Evalite Conformance

## Status
**Branch:** `experiment/evalite-conformance` (not intended for merge)
**Opened:** 2026-04-22
**Driver:** explore whether `arc-skill-eval` should conform fully to [Evalite](https://github.com/mattpocock/evalite) rather than keep its own orchestration, CLI, and report artifact.

This document tracks the experiment so `main` contributors know the divergence exists and can reason about future direction without reading the branch.

## Why this experiment exists
The framework today owns every layer: contract schema, loaders, fixtures, Pi adapters, canonical traces, scorers, JSON/HTML reporting, CLI orchestration. That's a real amount of code to maintain.

Evalite already provides:
- eval orchestration (Vitest-based)
- a scorer model + the `autoevals` library
- a trace/storage layer (SQLite at `node_modules/.evalite`)
- a local UI at `http://localhost:3006`
- watch-mode dev ergonomics
- `.eval.ts` as the discovery convention

The question this experiment answers: **if we stop owning orchestration/scoring plumbing/UI and conform to Evalite's conventions, how much of `src/` collapses, and what remains genuinely `arc-skill-eval`-specific?**

## What "conform to Evalite" means here
Not an adapter layer alongside the native runner. Full conformance:

- `skill.eval.ts` files are Evalite-native — they call `evalite(name, { data, task, scorers })` at module load so Evalite's file discovery picks them up directly.
- A `defineSkillEval({...contract})` helper wraps the contract into that `evalite()` call internally so authors still get a declarative API.
- `task` is where our Pi SDK adapter, fixture materializer, and trace normalizer live.
- `scorers` are our deterministic scorers reshaped to Evalite's scorer signature.
- Evalite's SQLite + UI replace (rather than complement) our native report artifact within the experiment.
- `arc-skill-eval` CLI is either retired or becomes a thin wrapper over `evalite run` / `evalite watch`.

## What stays ours
Even under full conformance, these remain framework IP:
- contract schema + normalization (`src/contracts/`)
- Pi SDK adapter + observer telemetry (`src/pi/`)
- fixture materialization + git state (`src/fixtures/`)
- canonical `EvalTrace` shape (`src/traces/`)
- deterministic scorer logic (`src/scorers/`) — but exposed as Evalite scorers
- skill discovery semantics (adjacent `SKILL.md` + `skill.eval.ts`)

## What is on the deprecation path within the experiment
- `src/cli/` orchestration — likely replaced by Evalite CLI entry points
- `src/reporting/json-report.ts` + `src/reporting/html-report.ts` — Evalite's storage/UI is the source of truth
- `src/cli/bin/arc-skill-eval.ts` — may become a thin shim or removed

## Spike target
The spike is aimed at the minimal fixture skill at `tests/fixtures/valid-skill-repo/skills/alpha/` so it can be iterated without external auth/credentials.

## Open design decisions (tracked here until resolved on the branch)

### A. CLI parity within one Evalite task
Evalite's `task` returns one output. Our parity lane runs the same case through SDK and CLI and compares.

**Experimental pick:** both runtimes inside one `task`, return `{ sdkTrace, cliTrace }`, parity comparison happens inside a dedicated scorer. Simpler than emitting two evals per parity case.

### B. Live-smoke gating
Evalite runs everything it discovers.

**Experimental pick:** live-smoke cases are filtered out of `data` at `defineSkillEval` time unless `ARC_INCLUDE_LIVE_SMOKE=1` is set in the environment.

### C. Canonical `report.json` survival
**Experimental pick:** retired within the experiment. Evalite's SQLite storage + UI are the reporting surface. If a CI-consumable JSON artifact is needed later, derive it from Evalite storage rather than maintaining a parallel pipeline.

## What would make this experiment a "go" vs a "no-go"

**Go (merge direction) if:**
- `src/` shrinks meaningfully (target: >30% reduction in orchestration/reporting/CLI lines)
- the authoring experience stays at least as good (one-file-per-skill, no generation step)
- Pi SDK + fixtures + telemetry remain cleanly expressible as `task` internals
- Evalite's beta status is acceptable for our stability needs

**No-go (stay native) if:**
- parity/live-smoke semantics feel fought-against instead of natural
- we end up re-implementing Evalite's orchestration inside our `task`s
- Evalite's SQLite/UI is lossy for our canonical trace needs
- the beta churn risk is too high for shipping to skill authors

## Not in scope for this experiment
- pilot cohort onboarding (W-000013 from the main-branch plan remains separate)
- publishing an `arc-skill-eval` release that depends on Evalite
- migrating other consumers off `report.json`

## Links
- [Evalite repo](https://github.com/mattpocock/evalite)
- [Evalite docs](https://www.evalite.dev)
- Main branch domain model: [../domain-model.md](../domain-model.md)
