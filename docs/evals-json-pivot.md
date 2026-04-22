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
- `docs/skill-eval-schema.md` (our custom schema doc). Will be replaced by a short authoring guide that points at Anthropic's docs for the canonical schema and documents our runtime-specific extensions only.

## Milestone plan

| Milestone | Scope | Rough size |
|---|---|---|
| **M1** | This plan doc merged; new internal types for `evals/evals.json`, `grading.json`, `benchmark.json`; stub modules so later milestones don't start from scratch | ~half day |
| **M2** | `evals/evals.json` loader + schema validator; one test fixture; a `read-evals-json` internal API that returns the parsed model | ~1 day |
| **M3** | Dual-run execution: extend Pi runner to invoke each case twice (with / without skill context); per-run timing + output capture; session isolation | ~1–2 days |
| **M4** | Assertion grading via Pi SDK with an LLM-judge prompt; `grading.json` emission per case/configuration | ~1 day |
| **M5** | Workspace + iteration dirs; `benchmark.json` aggregation with delta computation | ~1 day |
| **M6** | Rewrite `arc-creating-evals` skill to emit `evals/evals.json` + `evals/files/`; drop the TS-contract guidance | ~half day |
| **M7** | Deprecation pass: mark `SkillEvalContract`, scorer packs, lane types as internal/legacy; shrink `src/cli/*` + `src/reporting/*` accordingly; rewrite `tests/cli.test.mjs` + `tests/reporting.test.mjs` against `benchmark.json` | ~1 day |

Total rough estimate: **5–7 focused days**.

## Sequencing guidance
- Each milestone ships as its own PR against `main`.
- Each milestone must leave `npm run typecheck` and `npm test` green. Deprecation happens in-place rather than big-bang at M7 — we keep the old code paths running until the new ones cover them end-to-end.
- Break the plan if the first few milestones reveal the Anthropic format doesn't fit our Pi runtime cleanly. That's a go/no-go checkpoint worth honoring.

## Out of scope for this pivot
- **Rubric scoring.** Anthropic's methodology doesn't use a separate rubric lane — subjective-quality concerns show up as assertions or as human-review feedback in `feedback.json`. Our stubbed rubric type goes away with the TS contract.
- **CLI parity as a first-class lane.** In the Anthropic model, SDK-vs-CLI drift detection would be a *variant run configuration* (run the same case through both runtimes, compare outputs or assertion-level pass rates). It becomes a runtime concern, not an authoring concern. Defer until actually requested by an author.
- **Tiering.** Never implemented on main; it doesn't carry over. If we need trust tiers under the new model, they'd come from pass-rate thresholds, not declared target tiers.

## References
- [OpenAI blog: Eval Skills](https://developers.openai.com/blog/eval-skills)
- [Anthropic Skills docs (eval methodology)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills)
- [Open Skills standard](https://agentskills.io)
- Experiment that surfaced this direction: [`experiment/evalite-conformance`](https://github.com/andysolomon/arc-skill-eval/tree/experiment/evalite-conformance) — not for merge.
