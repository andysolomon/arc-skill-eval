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

## Slim-MVP milestone plan

The pivot starts as a minimum-viable shape: **single run per case, assertion grading, no dual-runtime, no iteration workspaces**. Anthropic's `with_skill` vs `without_skill` delta, `iteration-N/` dirs, and `benchmark.json` aggregation are all recognized post-MVP extensions — useful for *proving a skill adds value* but not required to answer *does my skill work*. They land after the MVP is proven.

| Milestone | Scope | Rough size |
|---|---|---|
| **M1** | Types for `evals/evals.json`, `EvalAssertion` discriminated union (string = LLM-judged, object = script-type), `GradingJson` shape; loader + schema validator with one test fixture; discovery of `SKILL.md` + `evals/evals.json` adjacency side-by-side with existing discovery | ~1 day |
| **M2** | Runner: Pi SDK with skill attached, one run per case, capture assistant text + touched files + timing. Grader: LLM-judge for string assertions + a small set of mechanical script assertions (file-exists, regex-match, json-valid). Per-case `grading.json` output | ~1 day |
| **M3** | CLI surface (`arc-skill-eval run <skill-dir-or-repo>`), author-side `arc-creating-evals` skill that emits the new format + minimal `evals/files/`, deprecation pass: remove `src/contracts/`, `src/scorers/`, `src/reporting/`, `src/traces/compare-parity.ts`, most of `src/cli/*`, and the old tests that covered them | ~1 day |

**Total rough estimate: ~3 focused days.**

## Deferred to post-MVP
- **`with_skill` vs `without_skill` dual-run** — the canonical "does this skill add value" signal. Adds one more Pi call per case and a small aggregator. Layer on when authors need the delta, not sooner.
- **Iteration workspaces** (`<skill>-workspace/iteration-N/`, per-iteration LLM-proposed SKILL.md diffs). Once the MVP is answering real questions, this becomes the natural "improve the skill" loop.
- **`benchmark.json` aggregation across eval sets.** Pairs with the dual-run feature.
- **Human-review `feedback.json`.** Authoring ergonomic; nice to have, not structural.

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
