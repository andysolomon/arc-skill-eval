# Pivot to `evals/evals.json`

## Direction
`arc-skill-eval` is moving from its custom TypeScript contract format (`skill.eval.ts` / `SkillEvalContract`) to **[Anthropic's documented skill-eval methodology](https://platform.claude.com/docs/en/agents-and-tools/agent-skills)**: `evals/evals.json` inside each skill directory, comparison of `with_skill` and `without_skill`, assertion-based grading, and iteration workspaces.

Decision date: 2026-04-22. Superseded formats: the TS contract on `main`, the Evalite-conformance experiment on `experiment/evalite-conformance`.

## Why this pivot
- **`SKILL.md` already uses a shared format.** `agentskills.io` is supported by Claude Code, Cursor, Codex, Gemini CLI, OpenCode, OpenHands, Pi, and other tools. Keeping that format avoids conversion.
- **The eval format also has a published method.** Anthropic documents `evals/evals.json`, `with_skill` and `without_skill`, `grading.json`, and `benchmark.json`. Using it avoids a separate authoring format.
- **The stated goal is to show that each skill works.** Pass-rate deltas against a no-skill baseline measure that directly. The previous lanes, dimensions, and scorecards were less direct.

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
Every case runs **twice** in the same iteration: once with the skill attached and once without it. The result reports the pass-rate **delta**, not an absolute score.

```
<skill>-workspace/
└── iteration-<N>/
    ├── eval-<id-or-slug>/
    │   ├── with_skill/
    │   │   ├── assistant.md      # final assistant response text
    │   │   ├── outputs/          # files produced by the run
    │   │   ├── timing.json       # duration + model/token/cost/context metrics
    │   │   ├── grading.json      # per-assertion pass/fail + evidence
    │   │   ├── trace.json        # normalized runtime trace
    │   │   ├── tool-summary.json # tool/skill-read/external/MCP activity counts
    │   │   └── context-manifest.json # skills/tools/context exposed to the model
    │   └── without_skill/
    │       ├── assistant.md
    │       ├── outputs/
    │       ├── timing.json
    │       ├── grading.json
    │       ├── trace.json
    │       ├── tool-summary.json
    │       └── context-manifest.json
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
- Lane taxonomy (routing / execution / cli-parity / live-smoke) in the authoring format. It may remain internally as execution strategies. For example, routing cases might still run as single-turn observations, but authors will not name lanes.
- Profile concept (planning / repo-mutation / external-api / orchestration) at the authoring surface. Same reasoning.
- The custom `report.json` / `report.html` output shape. Replaced by per-case `grading.json` + aggregate `benchmark.json`.
- Deterministic scorer packs (`src/scorers/profiles/*`) and the scoring engine. Replaced by assertion grading.
- `docs/skill-eval-schema.md`, `docs/skill-evals-v1.md`, and `docs/framework-repo-structure.md` were deleted. The README is now the authoring guide; it links to Anthropic's schema documentation and describes this runtime's script assertion extensions.

## Slim-MVP milestone plan

The first release supports **one run per case and assertion grading, without dual-runtime runs or iteration workspaces**. The `with_skill` and `without_skill` delta, `iteration-N/` directories, and `benchmark.json` aggregation are post-MVP extensions. They measure whether a skill improves results but are not required to check whether a skill works.

| Milestone | Scope | Rough size |
|---|---|---|
| **M1** ✅ | Types for `evals/evals.json`, `EvalAssertion` discriminated union (string = LLM-judged, object = script-type), `GradingJson` shape; loader + schema validator with one test fixture; discovery of `SKILL.md` + `evals/evals.json` adjacency side-by-side with existing discovery | done (#15) |
| **M2** ✅ | Runner (M2A, #16): Pi SDK with skill attached, one run per case, capture assistant text + workspace + timing. Grader (M2B, #17): LLM-judge for string assertions, mechanical script assertions (`file-exists`, `regex-match`, `json-valid`). Per-case `grading.json` output | done |
| **M3** ✅ | CLI `arc-skill-eval run` (M3a, #18). `arc-creating-evals` authoring skill at `skills/arc-creating-evals/` (M3b, #19). Deprecation pass (M3c, this PR): `src/scorers/`, `src/reporting/`, `src/traces/compare-parity.ts`, `src/cli/{list,validate,test}-command.ts`, legacy `src/load/` loaders, `src/contracts/validate.ts`, `tests/{cli,reporting,deterministic-scoring,contracts-and-loaders}.test.mjs`. Retained `src/contracts/{types,normalize}.ts` and `src/load/source-types.ts` as internal scaffolding that M2A's run-case.ts synthesizes for Pi's existing signature | done |

**Actual delivery: about 3 days and 8 PRs (#14 direction, #15 M1, #16 M2A, #17 M2B, #18 M3a, #19 M3b, this M3c, plus the #10 documentation note).**

## Deferred to post-MVP
- **Automatic iteration selection and improvement loops** (`<skill>-workspace/iteration-N/`, per-iteration LLM-proposed SKILL.md diffs). Explicit runner-only iteration buckets are implemented via `--iteration`.
- **Cross-run / cross-iteration benchmark comparison.** Builds on the per-run `benchmark.json` artifact.
- **Human-review `feedback.json`.** Useful for authoring, but not required by the runtime structure.

## Post-MVP progress
- **`with_skill` vs `without_skill` dual-run:** implemented as opt-in `--compare`. This emits per-case `with_skill/` and `without_skill/` artifacts and computes case-level pass-rate deltas.
- **`benchmark.json` aggregation:** implemented for `--compare` runs only. The artifact keeps an Anthropic-compatible core and stores Pi-specific artifact paths, timing, model, token, cost, context, and tool metadata under `metadata.extensions`.
- **Explicit iteration output layout:** implemented as `--iteration <name>`, writing under `<skillDir>/evals-runs/iteration-<name>/<runId>/` while leaving the default layout unchanged.
- **Response and usage artifacts:** implemented per run variant. `assistant.md` stores the final assistant response, and `timing.json` records duration, model, thinking level, token usage, estimated cost, context-window size, and context-window percentage used.
- **Tool and context artifacts:** implemented per run variant. `trace.json`, `tool-summary.json`, and `context-manifest.json` capture tool-call counts, skill reads, MCP-looking tool activity, external calls, and the skills, tools, and context exposed to the model.
- **Context loadout and conflict mode:** implemented as opt-in flags. `--extra-skill <path>` loads explicit distractor skills for conflict evals, and `--context-mode ambient` allows normal Pi ambient resources while recording the resulting loadout.

## Sequencing guidance
- Each milestone ships as its own PR against `main`.
- Each milestone must leave `npm run typecheck` and `npm test` passing. Keep old code paths until the new ones cover them end to end, then delete the old paths in M3.
- Within M2 the runner and grader can split into parallel subagents once M1's types are on main.

## Assertion grading contract
The MVP accepts both assertion shapes in a case's `assertions` array:

- **`string`:** graded by an LLM-judge prompt; the result is `{ passed, evidence }`.
- **`{ type: "file-exists" | "regex-match" | "json-valid", ...args }`:** graded by a deterministic script. This is faster and less expensive than an LLM judge and reliable for mechanical checks.

Script assertions cover cases where the LLM-judge is overkill or unreliable (file presence, exact regex, JSON validity). String assertions handle the rest. Anthropic's published format uses string-only; the typed-object variant is our extension.

## CLI + package name
Keep `arc-skill-eval` as the package and CLI name. It still tests skills through evals, so renaming would add migration work without clarifying the product.

## Out of scope for this pivot
- **Rubric scoring.** Anthropic's methodology does not use a separate rubric lane. Subjective quality appears in assertions or human-review feedback. The stubbed rubric type is removed with the TypeScript contract.
- **CLI parity as a first-class lane.** In the new model, SDK-vs-CLI drift detection would be a *variant run configuration*, not an authoring concern. Defer until actually requested.
- **Tiering.** Never implemented on main; doesn't carry over. If we need trust tiers later, they'd come from pass-rate thresholds, not declared target tiers.

## References
- [OpenAI blog: Eval Skills](https://developers.openai.com/blog/eval-skills)
- [Anthropic Skills docs (eval methodology)](https://platform.claude.com/docs/en/agents-and-tools/agent-skills)
- [Open Skills standard](https://agentskills.io)
- Experiment that led to this direction: [`experiment/evalite-conformance`](https://github.com/andysolomon/arc-skill-eval/tree/experiment/evalite-conformance), not intended for merge.
