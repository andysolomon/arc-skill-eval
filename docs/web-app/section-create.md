# `create` section spec

## Status

Draft (2026-07-22). Closes #172. Depends on ADR-0002 (stack), ADR-0004
(hosted persistence boundary), ADR-0006 (theme integration), and the
decision docs [`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
and [`persistence-spec.md`](./persistence-spec.md). The `Workspace Picker`
term (per [`docs/web-app/CONTEXT.md`](./CONTEXT.md)) is the entry point for
step 1's skill-path input on `localhost` mode.

## Overview

`create` is the only section that *writes* `evals/evals.json`. It is a
4-step wizard for authoring a starter eval suite from scratch:

1. List the behaviors that matter
2. Turn behaviors into prompts
3. Attach assertions
4. Review & run

`create` renders in exactly one **Env Variant** (`localhost` | `hosted`)
and one **Theme Variant** (`tokyonight` | `gruvbox` | `nord`) at a time,
inside the global chrome (50px header, 25px status bar, 16px page
padding). Localhost unlocks the LLM-side helpers (`generate starter
evals` callout, `✦ suggest`, the `▶ run --compare` button on the
console); hosted shows cyan explainer callouts in their place per
[`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md).

## Layout

Three columns, 16px page padding, 14px gap:

| Column | Width | Role |
|---|---|---|
| Step Rail | 214px (fixed) | Renders `NEW EVAL SUITE`, four numbered steps with selection bar, and a footnote "mirrors the learn flow" |
| Working pane | flex (max-width 700px) | Per-step content: kicker `STEP 0N` + 20px title + intro + step widgets |
| Live Preview | 344px (fixed) | Renders the in-progress `evals/evals.json` with syntax highlighting and a green `live` dot indicator |

Footer nav: `← back` / `next →` buttons. Back is `DISABLED` at step 1.
`next →` is `DISABLED` until the current step's required fields are
valid. At step 4 the `next →` collapses into the primary
`write evals.json` button (see [Step 4](#step-4-review--run)).

## Step 1: list the behaviors that matter

`STEP 01: list the behaviors that matter`

- **Skill path input** at the top. On `localhost` this is wired to the
  **Workspace Picker** per
  [`workspace-picker.md`](./decisions/workspace-picker.md): clicking the
  input opens the workspace dropdown; the chosen skill directory is
  validated for an adjacent `evals/evals.json`. On `hosted` the input is
  plain text (no fs access) and `evals.json` discovery is skipped.

- **Dimension legend** under the input, one line per dimension (the
  chips on the cards below are colored by dimension):

  | Dimension | Use |
  |---|---|
  | outcome | pass/fail observations of the agent's last response |
  | process | tool/skill usage, steps taken |
  | style | formatting, tone, structure |
  | efficiency | tokens, wall time, tool budget |

- **Behavior cards:** one per behavior, stacked. Each card is a text
  input (the behavior text) with four dimension chips
  (`trigger / execution / output / adjacent`) and a `remove` (×) button.
  Cards are reorderable via drag handle (mouse) or
  <kbd>Cmd/Ctrl+↑/↓</kbd> (keyboard).

- `＋ add behavior`: a dashed bordered button at the bottom of the
  list. Click to append an empty card focused on its text input.

- **Localhost-only callout** (green): `generate starter evals`. Contains
  a skill-chips row (selected skill-adjacent directory chips from the
  workspace picker) and an `✦ generate evals` button. The button invokes
  the sub-decision flow described in [Sub-decision: `generate starter evals`](#sub-decision-generate-starter-evals-llm-callout-localhost-only)
  and **appends** generated behaviors to the card list. It never replaces existing behaviors.

- **Hosted callout** (cyan, no action): explains why `generate starter
  evals` is a localhost-only feature and points at the Runtime CLI for
  hosted users.

## Step 2: turn behaviors into prompts

`STEP 02: turn behaviors into prompts`

- **Flavor legend** above the per-behavior list, one line per flavor:

  | Flavor | Use |
  |---|---|
  | explicit | surfaces the behavior verbatim in the prompt |
  | implicit | paraphrases; tests whether the agent infers the behavior from the request |
  | contextual | provides a setup context the prompt relies on |
  | adjacent-negative | verifies the agent *does not* do X (regression guard) |

- One row per behavior from step 1:

  - Behavior name + `edit behavior` link (re-opens step 1 in line edit).
  - A textarea for the prompt body, ~80 chars tall (large enough for
    3-4 lines), with character count and `expand` toggle.
  - Four flavor chips (one per row, set independently per behavior).
    Selecting a chip places the chip in `advisory` position. A single
    prompt can carry multiple flavors.
  - `✦ suggest` button (localhost only): invokes an LLM fill for the
    textarea given the behavior text + selected flavors; the suggested
    text replaces the textarea content after a 1.5s dwell with a
    `↶ revert` chip for undo within 30s.

- Hosted has no `✦ suggest` button. The textarea is the only input.

## Step 3: attach assertions

`STEP 03: attach assertions`

- **Hint box** at the top, one line: "Good assertions are deterministic
  *or* judge-prompted; weak ones script regexes hoping for the right
  shape." Boxes use `--tt-bg-dark` with a `--tt-cyan` left border.

- One assertion group per behavior (collapsible). Inside each group:

  - A stack of assertion rows: kind label (e.g. `file-exists`,
    `regex-match`, `judge`, `json-valid`, …) + value input + `remove`.
  - Each behavior group footer has dashed add-chips per kind; clicking
    appends a row with the kind pre-selected and the value input
    focused.

- **Localhost-only**: an empty-behavior group can be expanded to show a
  `✦ suggest assertions` button that proposes deterministic assertions
  from the prompt and behavior text.

## Step 4: review and run

`STEP 04: review and run`

- **Four stat cards** in a 1×4 row:

  | Card | Counted from |
  |---|---|
  | CASES | behavior cards in step 1 |
  | ASSERTIONS | assertion rows across all behavior groups in step 3 |
  | DETERMINISTIC | assertion rows where kind ∈ {`file-exists`, `regex-match`, `json-valid`} |
  | JUDGE | assertion rows where kind = `judge` |

- A command block showing the assembled
  `$ arc-skill-eval run --compare --skill <dir>` command, with
  click-to-copy.

- A primary `write evals.json` button (full-width on the working pane).
  Disabled until all stat counts are non-zero. On click:
  - Localhost: writes to `<workspaceDir>/<skill-name>/evals/evals.json`
    via the workspace-picker CLI handshake and emits a `✓ wrote` toast
    in the status bar.
  - Hosted: downloads `evals.json` as a file (the Runtime CLI is the
    landing target).

- A `run it in the console ->` link below the button. On localhost this
  opens the `run` section at the same composer; on hosted it links to
  the help page describing local CLI usage.

## Env variants

| Surface | Localhost | Hosted |
|---|---|---|
| Skill path input | Workspace Picker dropdown | Plain text input |
| `generate starter evals` callout | Green, with `✦ generate evals` | Cyan explainer callout only |
| `✦ suggest` (step 2) | Available | Hidden |
| `✦ suggest assertions` (step 3) | Available | Hidden |
| `write evals.json` button | Writes to disk via CLI handshake | Downloads `evals.json` |

## Sub-decision: `generate starter evals` LLM callout (localhost only)

This is the one LLM call `create` makes today. It is gated to `localhost`
per [`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
and follows the **no silent writes** posture of
[`persistence-spec.md`](./persistence-spec.md).

**Inputs to the call.**

- the skill directory picked via the Workspace Picker
- the LLM model selected via the existing run composer `--model` field
  (single source of truth for which model picks cases; no separate
  picker in `create`)
- the prompt assembly: the chosen skill's full `SKILL.md` (progressive
  disclosure respected; see `learn` chapter 2) plus the discovery from
  `src/skeval-discover.ts` (any existing `evals/evals.json` if found —
  used as in-context examples, never mutated)

**Call shape.** The web app calls a lightweight local daemon exposed by
the workspace-picker CLI handshake (same channel per
[`workspace-picker.md`](./decisions/workspace-picker.md)). The daemon
forwards the request to the in-process runtime already used by
`arc-skill-eval run`: it owns the model picker and the cost ceiling, so
`create` does not introduce a separate LLM integration. Request:

```http
POST /generate-evals
Content-Type: application/json

{ "skillPath": "<absolute>", "model": "<id>", "maxBehaviors": 8 }
```

**Output shape.** A partial `evals.json` document, `{ evals: EvalCase[] }`,
with empty `id` and `description` fields and placeholder
`assertions: []`. The web app assigns ids (`behave-<n>`), back-fills
`description` from the user-friendly behavior text, and inserts the
cases into step 1's list. The user reviews the populated step 1 and
edits before proceeding.

**Failure modes.** Caller shows a non-blocking error toast if the
daemon is unreachable, the model errors, or the response fails
validation against the existing
[`src/evals/types.ts`](../../src/evals/types.ts) `EvalCase` schema. The
user is never left with a partially populated step 1; on failure the
append is rolled back and the callout returns to its initial state with
a `↻ retry` button.

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md):
  Vite + React + TS stack; step-rail/working-pane/live-preview layout
  uses the gap + max-width conventions from §1.4 of design.md.
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md):
  hosted has no LLM or filesystem, so it uses cyan callouts and the
  downloaded `evals.json` flow are the expression of that.
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md): theme
  swap never remounts; the Live Preview's "live" dot pulses via the
  same tick cadence as the prototype.
- [`docs/web-app/CONTEXT.md`](./CONTEXT.md): `App Section`, `Env
  Variant`, `Theme Variant`, `Step Rail`, `Live Preview`, `Section
  Kicker`, `Workspace Picker`, `Composer Row` *(for the run composer
  fields reused on step 4)*.
- [`decisions/hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
  — `localhost` is the primary side; cyan callouts replace green ones
  on `hosted`.
- [`decisions/workspace-picker.md`](./decisions/workspace-picker.md)
  — supplies the skill-path input on `localhost` and the disk-write
  back-channel used by `write evals.json`.
- [`persistence-spec.md`](./persistence-spec.md) — `create` itself
  writes nothing to IndexedDB; only the run composer state may persist
  to `preferences` while the user is mid-step.
- Issues: [#172](https://github.com/andysolomon/arc-skill-eval/issues/172)
  (this `create` spec) · [#170](https://github.com/andysolomon/arc-skill-eval/issues/170)
  (`run` spec — receives the in-progress wizard on `run it in the
  console →`) · [#173](https://github.com/andysolomon/arc-skill-eval/issues/173)
  (`review` spec — consumer of the produced `evals.json` via runs)
  · [#175](https://github.com/andysolomon/arc-skill-eval/issues/175)
  (final README indexes this spec).
