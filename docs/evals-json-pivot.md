# Pivot to `evals/evals.json` (Anthropic Skill-Eval Standard)

## Direction
`arc-skill-eval` is pivoting away from its custom TypeScript contract format (`skill.eval.ts` / `SkillEvalContract`) to consume **[Anthropic's documented skill-eval methodology](https://platform.claude.com/docs/en/agents-and-tools/agent-skills)** — `evals/evals.json` inside each skill directory, dual-runtime comparison (`with_skill` vs `without_skill`), assertion-based grading, and iteration workspaces.

Decision date: 2026-04-22. Superseded formats: the TS contract on `main`, the Evalite-conformance experiment on `experiment/evalite-conformance`.

## Why this pivot
- **The SKILL.md half is already a standard.** `agentskills.io` is an open format supported by a dozen+ agent vendors (Claude Code, Cursor, Codex, Gemini CLI, OpenCode, OpenHands, Pi, and more). Keeping this alignment is free.
- **The eval half has a published methodology too.** Anthropic's `evals/evals.json` + `with_skill/without_skill` + `grading.json` + `benchmark.json` is the canonical shape. Competing with a standard costs us authoring friction and ecosystem isolation.
- **The user-stated goal is trust, not flexibility.** "Every skill ships with an eval so users know it works well." Pass-rate deltas against a no-skill baseline are the direct signal for that; our lanes/dimensions/scorecards are indirect and harder for a user to read.

## Authoring format (what skill authors write)
```
<skill-dir>/
├── SKILL.md              # unchanged, agentskills.io format
└── evals/
    └── evals.json        # new primary input
    └── files/            # optional per-case input fixtures
```

Shape of `evals/evals.json`:

```json
{
  "skill_name": "arc-conventional-commits",
  "evals": [
    {
      "id": 1,
      "prompt": "Set up semantic-release in this repo.",
      "expected_output": "semantic-release installed with Conventional Commits preset, .releaserc.json created, release script added to package.json.",
      "files": ["evals/files/clean-repo/package.json"],
      "assertions": [
        "The output includes a .releaserc.json with conventionalcommits preset",
        "package.json has a release script pointing at semantic-release",
        "No existing versioning tools (standard-version, changesets) were ignored or left in place"
      ]
    }
  ]
}
```

## Execution model
Every case runs **twice** in the same iteration — once with the skill attached, once without — so the pass-rate **delta** is the output signal, not an absolute score.

```
<skill>-workspace/
└── iteration-<N>/
    ├── eval-<id-or-slug>/
    │   ├── with_skill/
    │   │   ├── outputs/          # files produced by the run
    │   │   ├── timing.json       # { total_tokens, duration_ms }
    │   │   └── grading.json      # per-assertion pass/fail + evidence
    │   └── without_skill/
    │       ├── outputs/
    │       ├── timing.json
    │       └── grading.json
    └── benchmark.json            # aggregated with_skill vs without_skill delta
```

## Grading
Assertions are graded per-case by an LLM-judge plus optional deterministic scripts for mechanical checks (file presence, valid JSON, etc.). `grading.json` records each assertion with `passed` + `evidence`.

Per Anthropic's guidance: *"Require concrete evidence for a PASS. Don't give the benefit of the doubt."*

## What stays from the main-branch framework
- **Pi SDK + Pi CLI JSON runtimes** (`src/pi/`). The underlying agent invocation stays ours.
- **Fixture materialization** (`src/fixtures/`). When an `evals.json` case declares `files`, we still need to materialize them into an isolated workspace.
- **`EvalTrace` shape** (`src/traces/`). Useful internally for capturing what happened during a run, even if it's not the author-facing surface.

## What's deprecated
- `SkillEvalContract` TypeScript type and the `skill.eval.ts` adjacency pattern.
- Lane taxonomy (routing / execution / cli-parity / live-smoke) at the *authoring* surface. May survive internally as execution strategies — e.g., routing-style cases might still run as a single-turn observation — but authors won't name lanes.
- Profile concept (planning / repo-mutation / external-api / orchestration) at the authoring surface. Same reasoning.
- The custom `report.json` / `report.html` output shape. Replaced by per-case `grading.json` + aggregate `benchmark.json`.
- Deterministic scorer packs (`src/scorers/profiles/*`) and the scoring engine. Replaced by assertion grading.
- `docs/skill-eval-schema.md`, `docs/skill-evals-v1.md`, `docs/framework-repo-structure.md` — all deleted. The README is now the authoritative authoring guide; it points at Anthropic's docs for the canonical schema and documents our runtime-specific extensions (script assertions) only.

## Slim-MVP milestone plan

The pivot starts as a minimum-viable shape: **single run per case, assertion grading, no dual-runtime, no iteration workspaces**. Anthropic's `with_skill` vs `without_skill` delta, `iteration-N/` dirs, and `benchmark.json` aggregation are all recognized post-MVP extensions — useful for *proving a skill adds value* but not required to answer *does my skill work*. They land after the MVP is proven.

| Milestone | Scope | Rough size |
|---|---|---|
| **M1** ✅ | Types for `evals/evals.json`, `EvalAssertion` discriminated union (string = LLM-judged, object = script-type), `GradingJson` shape; loader + schema validator with one test fixture; discovery of `SKILL.md` + `evals/evals.json` adjacency side-by-side with existing discovery | done (#15) |
| **M2** ✅ | Runner (M2A, #16): Pi SDK with skill attached, one run per case, capture assistant text + workspace + timing. Grader (M2B, #17): LLM-judge for string assertions, mechanical script assertions (`file-exists`, `regex-match`, `json-valid`). Per-case `grading.json` output | done |
| **M3** ✅ | CLI `arc-skill-eval run` (M3a, #18). `arc-creating-evals` authoring skill at `skills/arc-creating-evals/` (M3b, #19). Deprecation pass (M3c, this PR): `src/scorers/`, `src/reporting/`, `src/traces/compare-parity.ts`, `src/cli/{list,validate,test}-command.ts`, legacy `src/load/` loaders, `src/contracts/validate.ts`, `tests/{cli,reporting,deterministic-scoring,contracts-and-loaders}.test.mjs`. Retained `src/contracts/{types,normalize}.ts` and `src/load/source-types.ts` as internal scaffolding that M2A's run-case.ts synthesizes for Pi's existing signature | done |

**Actual delivery: ~3 focused days, 8 PRs (#14 direction, #15 M1, #16 M2A, #17 M2B, #18 M3a, #19 M3b, this M3c; plus #10 docs-only divergence note).**

## Deferred to post-MVP
- **Iteration workspaces** (`<skill>-workspace/iteration-N/`, per-iteration LLM-proposed SKILL.md diffs). Once the MVP is answering real questions, this becomes the natural "improve the skill" loop.
- **`benchmark.json` aggregation across eval sets.** Pairs with the dual-run feature.
- **Human-review `feedback.json`.** Authoring ergonomic; nice to have, not structural.

## Post-MVP progress
- **`with_skill` vs `without_skill` dual-run** — implemented as opt-in `--compare`. This emits per-case `with_skill/` and `without_skill/` artifacts and computes case-level pass-rate deltas in memory. `benchmark.json` aggregation remains deferred.

## Sequencing guidance
- Each milestone ships as its own PR against `main`.
- Each milestone must leave `npm run typecheck` and `npm test` green. Deprecation happens in-place — we keep the old code paths until the new ones cover them end-to-end, then delete in M3.
- Within M2 the runner and grader can split into parallel subagents once M1's types are on main.

## Assertion grading contract
The MVP accepts both assertion shapes in a case's `assertions` array:

- **`string`** — graded by an LLM-judge prompt, result is `{ passed, evidence }`.
- **`{ type: "file-exists" | "regex-match" | "json-valid", ...args }`** — graded by a deterministic script. Faster and cheaper than the LLM-judge, and reliable for mechanical checks.

Script assertions cover cases where the LLM-judge is overkill or unreliable (file presence, exact regex, JSON validity). String assertions handle the rest. Anthropic's published format uses string-only; the typed-object variant is our extension.

## CLI + package name
Keep `arc-skill-eval` as the package and CLI name. The framework still tests skills via evals — the name remains accurate; migrating it costs work for zero value.

## Out of scope for this pivot
- **Rubric scoring.** Anthropic's methodology doesn't use a separate rubric lane — subjective-quality concerns show up as assertions or as human-review feedback. Our stubbed rubric type goes away with the TS contract.
- **CLI parity as a first-class lane.** In the new model, SDK-vs-CLI drift detection would be a *variant run configuration*, not an authoring concern. Defer until actually requested.
- **Tiering.** Never implemented on main; doesn't carry over. If we need trust tiers later, they'd come from pass-rate thresholds, not declared target tiers.

## References
- [OpenAI blog: Eval Skills](https://developers.openai.com/blog/eval-skills)
- [Anthropic Skills docs (eval methodology)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills)
- [Open Skills standard](https://agentskills.io)
- Experiment that surfaced this direction: [`experiment/evalite-conformance`](https://github.com/andysolomon/arc-skill-eval/tree/experiment/evalite-conformance) — not for merge.
