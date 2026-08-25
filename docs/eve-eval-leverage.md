# Eve features relevant to skill evals

Decision / strategy note: 2026-07-22. Companion to [evals-json-pivot.md](./evals-json-pivot.md) and [laminar-integration-research.md](./laminar-integration-research.md).

Primary Eve references: [defineEval overview](https://eve.dev/docs/evals/overview), [assertions](https://eve.dev/docs/evals/assertions), [judge](https://eve.dev/docs/evals/judge), [cases](https://eve.dev/docs/evals/cases), [running evals](https://eve.dev/docs/evals/running).

## Verdict

**Do not switch to Eve `defineEval`.** Eve and arc-skill-eval solve different problems:

| | Eve | arc-skill-eval |
|---|---|---|
| Unit under test | An HTTP `defineAgent` app | A portable `SKILL.md` skill |
| Authoring | Imperative `.eval.ts` with `test(t)` | Declarative `evals/evals.json` co-located with the skill |
| Runtime | Live eve server / session protocol | Pi agent loop + fixtures / sandbox |
| Ecosystem bet | Vercel/eve agent apps | Anthropic skill-eval methodology + agentskills.io |

We already pivoted *to* Anthropic's format in [evals-json-pivot.md](./evals-json-pivot.md) for portability and trust ("every skill ships with an eval"). Adopting `defineEval` would reverse that: evals would become TypeScript tied to an eve app, not a skill artifact that travels with `SKILL.md`.

Use Eve as a reference for eval authoring and documentation, then implement the grading behavior that our existing types already describe.

```mermaid
flowchart LR
  subgraph keep [Keep]
    evalsJson["evals/evals.json"]
    pi["Pi runtime"]
    compare["--compare with/without"]
  end
  subgraph adopt [Adopt from Eve]
    behavior["tool/skill behavior asserts"]
    severity["gate vs soft + --strict"]
    judge["scored judges + thresholds"]
    ci["JUnit / artifact CI story"]
    learn["Learn pedagogy ladder"]
  end
  adopt --> keep
```

## Features to adopt from Eve

1. **Combined driver and assertion API.** Eve's `t` is both the session driver and assertion API. Our declarative JSON cannot use the same API, but Learn should teach the same sequence: the prompt drives the run, assertions grade it, and authors should use the least expensive suitable check.
2. **Behavior assertions.** Eve provides `t.calledTool`, `t.notCalledTool`, `t.toolOrder`, `t.loadedSkill`, and `t.usedNoTools`. We already declare related forms in `src/evals/types.ts` (`tool-call-required`, `tool-call-forbidden`, `skill-read-required`), but `src/evals/assertion-engine.ts` still returns *"not implemented yet"* for behavior and safety assertions. Implementing them would support process checks.
3. **Gate and soft severity.** Eve puts severity on the handle (`.gate()` / `.soft()` / `.atLeast()`), with `--strict` for CI. We have `mustPass` / `severity` fields, but Learn and CLI treat every assertion as hard pass/fail. Soft judge scores with strict CI would support non-blocking style and quality checks.
4. **Use judges only when deterministic checks are insufficient.** Eve's sequence (scoped -> `t.check` -> `t.judge.autoevals`) matches our authoring skill's priority but explains it more clearly. Its autoevals graders (`closedQA`, `factuality`) also have more specific names than free-form string rubrics.
5. **CI output.** Eve provides `eve eval --strict --junit` and `.eve/evals/<ts>/` artifacts. We already produce detailed per-case artifacts; Learn and Run should document an equally direct CI command.
6. **Small smoke baseline.** Eve recommends a few behavioral smoke tests before datasets or judges. This matches the 6-10 case guidance in `arc-creating-evals` and should be the initial approach taught in the Learn Create chapter.

## What *not* to copy

- **`.eval.ts` / `defineEval` as the primary format.** This would make evals depend on an Eve app instead of keeping them portable with the skill.
- **HTTP target model (`t.target`, schedules, channels).** It does not match skill evals that run in Pi workspaces.
- **Path-as-id file fan-out.** A stable case `id` inside one `evals.json` is simpler for suites stored next to skills.
- **Full multi-turn imperative scripting.** This may be useful later as an optional extension (`turns[]` in JSON), but most skill evals need one prompt and a workspace outcome.

## Recommended workstreams

### A. Runtime: implement the typed behavior assertions

Keep these changes in `evals.json`:

- Implement trace-aware grading for `BehaviorAssertion` / `SafetyAssertion` using existing `trace.json` / `tool-summary.json` from runs (`src/evals/assertion-engine.ts`).
- Map Eve vocabulary → our JSON kinds for authoring guidance:
  - `calledTool` → `{ kind: "behavior", method: "tool-call-required", value }`
  - `notCalledTool` → `tool-call-forbidden`
  - `loadedSkill` → `skill-read-required`
- Add matcher basics where cheap: exact tool name + optional input substring/regex (Eve's full predicate language can wait).
- Teach and prefer these in `skills/arc-creating-evals/SKILL.md` Phase 4 *above* string judges when process is the claim.

### B. Runtime: gate / soft / thresholds (Eve severity model)

- Honor `mustPass: false` / `severity: "info"|"warn"` as soft: recorded in `grading.json`, do not fail the case by default.
- Add CLI `--strict` so soft misses fail the exit code (CI gate).
- ✅ **Shipped (#231):** scored judge assertions with `atLeast`, inspired by `t.judge.autoevals.closedQA(...).atLeast(0.8)`, without requiring Braintrust. The implementation uses a `1..scaleMax` integer rubric (default 5) rather than a `0-1` fraction. `judge(...).atLeast(4)` passes when the judge's rubric score is at least 4.

### C. Learn section: teach Eve *principles* in our product language

Update chapters under `web/src/sections/learn/` (keep the seven chapters from `chapterList.ts`; add detail without presenting Eve as part of the product):

| Chapter | Steal from Eve |
|---|---|
| **Create** | "Smoke first": succeeded-equivalent + 1–2 content/behavior checks before datasets; assert *effect*, not paraphrased instructions |
| **Assert** | Explicit order: script/workspace -> behavior/tool -> regex/exact -> judge; "judges use tokens, so use them last"; preview gate vs soft once B lands |
| **Signal** | Keep with/without (our differentiator Eve lacks); contrast Eve's absolute gates vs our delta signal |
| **Run** | CI recipe: exit codes, `--strict`, and uploaded `evals-runs/` artifacts; keep console output brief and details in artifacts |
| **Pi** | Pair with Eve's `mockModel` idea: when to use sandbox mocks / fixtures for deterministic process checks without live model noise |

Also fix Learn drift vs runtime where Assert documents types that don't exist yet (`file-absent`) or aren't implemented (behavior) — either ship them or label as upcoming so the reader isn't lied to.

**Repo findings to reconcile while doing this:**

- Learn currently ships as hardcoded TSX chapters (`web/src/sections/learn/chapters/`); richer MDX under `docs/web-app/learn/` is not loaded. Pick one source of truth (recommend: keep TSX authoritative for the app, treat MDX as draft/spec until wired or deleted).
- Create emits a thinner `evals.json` than the runtime supports (missing `expected_output`, `setup`/`files`, assertion ids/severity, behavior/intent kinds). Align Create after behavior grading lands.
- Progress persistence exists but only chapter selection is wired; scroll/completion hooks are unused.
- Canonical `skills/arc-creating-evals/SKILL.md` and the `.agents` mirror are not byte-identical — reconcile when updating authoring guidance.
- No project references to Eve today; Evalite was the only named alternate framework experiment and was not merged.

### D. Typed builder that emits JSON

> **Status: ✅ shipped (2026-07-25).** Five reviewed PRs delivered the builder and `toJSON` (#224), `arc-skill-eval emit` and `--check` (#225), the Learn "Advanced: typed builder" callout (#226), the `arc-creating-evals` optional TypeScript authoring path (#227), and fixture-relative dataset loaders (#228). Scored judges using `.atLeast(n)` followed in #231. `evals/evals.json` remains the only runtime and discovery input. The subsections below preserve the original design and note differences in the shipped code.

**Goal:** provide typed helpers, composition, dataset expansion, and assertion severity while keeping **`evals/evals.json` as the only runtime and discovery contract**.

This is **not** Eve `defineEval`. There is no `async test(t)`, no `t.send`, and no live session driver. The builder constructs an `EvalsJsonFile` with the shape in `src/evals/types.ts`; the existing Pi runner stays unchanged.

```mermaid
flowchart LR
  author["Author: suite.eval.ts or script"]
  builder["arc-skill-eval/evals builder"]
  json["evals/evals.json"]
  runner["arc-skill-eval run"]
  create["Create wizard / hand JSON"]
  author --> builder --> json --> runner
  create --> json
```

#### Public API (proposed)

Export from something like `arc-skill-eval/evals` (package `exports` entry; implementation under `src/evals/builder/`):

```ts
import {
  defineSkillEval,
  evalCase,
  seeded,
  fileExists,
  jsonValid,
  regexMatch,
  judge,
  toolRequired,
  toolForbidden,
  skillReadRequired,
} from "arc-skill-eval/evals";

export default defineSkillEval({
  skill_name: "arc-conventional-commits",
  version: "1",
  cases: [
    evalCase({
      id: "execution-clean-repo",
      description: "Golden path on an empty npm package",
      prompt: "Set up semantic-release with conventional commits in this repo.",
      expected_output: ".releaserc.json + release script",
      setup: seeded({ from: "files/clean-repo", to: ".", mountMode: "flatten-contents" }),
      metadata: { tags: ["execution", "golden"], difficulty: "easy" },
      assertions: [
        fileExists(".releaserc.json"),
        jsonValid(".releaserc.json"),
        regexMatch("conventionalcommits", { file: ".releaserc.json" }),
        toolRequired("Write"), // once behavior grading ships
        judge("Confirms no prior versioning tooling was detected").soft(), // tracked unless --strict
      ],
    }),
  ],
});
```

**Assertion helpers** return plain `EvalAssertion` objects (or a thin `AssertionBuilder` that is JSON-serializable via `toJSON`):

| Helper | Emits |
|---|---|
| `fileExists(path)` | `{ type: "file-exists", path }` |
| `jsonValid(path)` | `{ type: "json-valid", path }` |
| `regexMatch(pattern, opts?)` | `{ type: "regex-match", … }` |
| `judge(prompt)` | string **or** `{ kind: "output", method: "judge", prompt, id }` |
| `toolRequired(name)` / `toolForbidden(name)` | behavior intent objects |
| `skillReadRequired(name?)` | behavior intent |
| `exact(expected)` / `outputRegex(pattern)` | output intent |

**Severity (Eve-inspired, declarative):** chain on the builder handle, bake into `mustPass` / `severity` (and later score thresholds):

- `.gate()` → hard fail (default for script/behavior)
- `.soft()` → `mustPass: false` / `severity: "warn"` (default for judge once soft severity ships)
- `.atLeast(n)` → ✅ **shipped (#231):** scored judge. The judge rates the output on a `1..scaleMax` rubric (default 5) and the assertion passes iff `score >= n`. `.atLeast(8, { outOf: 10 })` sets a custom ceiling. Chained onto a non-judge assertion it throws at build time. (Note the shipped rubric is `1..N` integer, not the `0–1` fraction the earlier sketch imagined.)
- `.id("…")` → stable assertion id for grading joins

Helpers must be **pure and sync**. No I/O inside assertion builders; fixtures stay as `setup` / `files` data.

#### Dataset fan-out (primary reason to want the builder)

```ts
import { loadJson } from "arc-skill-eval/evals/loaders"; // thin, fixture-relative

const rows = await loadJson<{ id: string; prompt: string; needle: string }[]>(
  "evals/data/triggers.json",
);

export default defineSkillEval({
  skill_name: "arc-conventional-commits",
  cases: rows.map((row) =>
    evalCase({
      id: row.id,
      prompt: row.prompt,
      assertions: [
        judge(`Response addresses: ${row.needle}`).soft(),
      ],
    }),
  ),
});
```

Same idea as Eve’s array-exported `defineEval`s, but the product is still one `evals.json` blob (or one emit per skill).

> **As shipped (#228):** `loadJson`/`loadJsonl` take an optional `{ base }` — pass `{ base: import.meta.url }` to resolve the data path relative to the suite file rather than the process cwd (absolute paths pass through). Read/parse failures throw `DatasetLoadError` so they surface cleanly through `emit`.

#### Emit / discovery contract (locked)

1. **Canonical on disk for runs:** `<skillDir>/evals/evals.json`
2. **Builder source (optional):** e.g. `<skillDir>/evals/suite.eval.ts` or a repo script — never required
3. **Emit paths (pick both eventually, ship CLI first):**
   - Library: `suite.toJSON()` / `JSON.stringify(suite, null, 2)` where `defineSkillEval` returns a branded object with `toJSON(): EvalsJsonFile`
   - CLI: `arc-skill-eval emit <skillDir>` or `arc-skill-eval emit --from evals/suite.eval.ts --out evals/evals.json`
4. **Runner does not import TS suites by default.** Avoids dual discovery, Evalite-shaped load-time side effects, and hosted/Create divergence. Emit is an authoring step (local or CI codegen check).
5. **CI option:** `emit --check` fails if committed `evals.json` drifts from the builder source (like generated lockfiles).

#### What `defineSkillEval` validates at build time

Reuse / wrap `src/evals/loader.ts` validators so emit fails early on:

- duplicate case ids
- invalid assertion shapes
- setup/source path shape (existence check optional at emit; required at run)

#### Relationship to Create / Learn / authoring skill

- **Create wizard** keeps writing JSON directly (no TS required for the common path).
- **Learn** teaches JSON first; a short “Advanced: typed builder” callout shows the helper → JSON mapping (Eve pedagogy without Eve runtime).
- **`arc-creating-evals`** may *optionally* emit a `suite.eval.ts` + generated `evals.json` for authors who prefer TS; default remains JSON-only.

#### Sequencing relative to other workstreams

Builder value is low until behavior asserts and soft severity exist — otherwise helpers wrap half-implemented types. Order (all shipped):

1. ✅ Behavior/safety grading + soft/`--strict` (#223)
2. ✅ Thin `src/evals/builder/` + `toJSON` + unit tests that round-trip to loader (#224)
3. ✅ `arc-skill-eval emit` (+ optional `--check`) (#225)
4. ✅ Learn advanced callout (#226) + authoring-skill optional TS path (#227)
5. ✅ Dataset loaders (`arc-skill-eval/evals/loaders`, `loadJson`/`loadJsonl`) for fan-out beyond hand JSON (#228)

#### Explicitly out of scope for v1 builder

- Imperative `test(t)` / multi-turn send/respond
- Discovering `.eval.ts` as a run input without emit
- Braintrust/autoevals coupling
- Replacing Anthropic string assertions (strings remain valid; `judge()` may emit them)

### E. Explicit non-goal (unless later requested)

Do **not** wire `eve` / `eve/evals` as a dependency or second runner. If we ever want Eve as a host, that is a separate ADR: "Pi skill evals vs Eve agent evals," not a drop-in for `defineEval`.

## Suggested sequencing

1. **Learn content pass (immediate, low risk)** — assertion ladder + smoke-first Create + Run CI framing; call out unimplemented behavior asserts honestly.
2. **Implement behavior/safety grading from traces** — unlocks Eve's best assertion idea inside our format.
3. **Soft severity + `--strict`** — unlocks scored/quality checks without flaky CI by default.
4. **Authoring skill + Create wizard** — prefer behavior asserts in `arc-creating-evals` and create UI once runtime supports them.
5. **Typed JSON builder** — `defineSkillEval` / assertion helpers / `emit` (+ `--check`); Learn advanced callout. After 2–3 so helpers map to real graders.

## Bottom line

Eve's `defineEval` is an excellent *design reference*, not our next authoring format. Keep `evals.json` as the skill-portable contract; steal Eve's assertion richness, severity model, and teaching clarity; use Learn to make those principles obvious to authors. A **typed builder that emits JSON** is the right programmatic layer: Eve ergonomics for authors, Anthropic shape for the ecosystem, zero second runner.
