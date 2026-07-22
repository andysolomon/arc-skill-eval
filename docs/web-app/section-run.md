# `run` section spec

## Status

Draft (2026-07-22) — closes #170. Consumes ADR-0002 (stack), ADR-0004
(hosted persistence boundary), ADR-0006 (theme integration), and the
decision docs [`workspace-picker.md`](./decisions/workspace-picker.md),
[`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md),
and [`persistence-spec.md`](./persistence-spec.md).

## Overview

`run` is the **flagship section** of the web app: the surface where
the user composes and launches an eval run. On `localhost` it reads the
skill directory from the **Workspace Picker** and dispatches the run
through the local CLI daemon (per
[`workspace-picker.md`](./decisions/workspace-picker.md)). On `hosted`
the section is replaced by an `import evals.json` workflow — hosted
never executes a run; `run` on hosted is purely an artifact-import
gateway into `browse` and `review`.

`run` renders in exactly one **Env Variant** and one **Theme Variant** at
a time, inside the global chrome.

## Layout

Two panels, 16px page padding, 14px gap.

| Panel | Width | Role |
|---|---|---|
| Composer | 392px (fixed) | Stacked **Composer Row** fields plus the primary run button |
| Console | flex | `COMMAND` kicker + assembled CLI command + idle/run/completion state |

Per [`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
the entire section swaps its variants by env. Hosted has no Composer;
the Console is preceded by an `Import Card`. Both variants are
described below.

## Composer (localhost)

Stacked rows in this order; clicking a row expands it into an inline
option dropdown (`openField`). At most one row may be expanded at a
time. Each row follows the **Composer Row** shape from
[`docs/web-app/CONTEXT.md`](./CONTEXT.md): label-left (`--tt-comment`)
+ value-right in the field's accent color + small chevron.

| Field | Default | Accent | Options (summary) |
|---|---|---|---|
| `--skill` | `<workspace picker>` | `--tt-fg` | opens workspace dropdown |
| `--case` | `*` (all cases) | `--tt-fg` | one row per `evals.json` `id`; `*` and `all` alias |
| `--model` | last persisted | `--tt-cyan` | searchable dropdown of runtime models |
| `--judge-model` | `--model` | `--tt-magenta` | same dropdown; can match |
| `--compare` | `off` | `--tt-magenta` | `off` \| `with` (use-case only) \| `on` (with+without pair) |
| `--extra-skill` | none | `--tt-cyan` | workspace picker dropdown; multi-select |
| `--iteration` | `1` | `--tt-fg` | `1`–`5` |
| `--context-mode` | `isolated` | `--tt-cyan` | `isolated` \| `ambient` |
| `--sandbox` | `none` | `--tt-orange` | `none` \| `just-bash` (per `learn` chapter 7) |

Composer footer: primary button `▶ run --compare` (green when
`--compare=on`, neutral otherwise). On click it morphs to a spinner +
`↻ reset` while the run lifecycle is in-flight.

## Console (localhost)

States, top to bottom:

- **Idle.** `COMMAND` kicker + the assembled CLI command (flags
  word-wrapped at 60ch with `--wrap=…`). Body text in `--tt-fg-dark`.
- **Run in-flight.** Same command block, then per-case progress rows
  appending on `--iteration` ticks (~0.1s in the prototype):
  `spinner | case-id | assertions n ✓ / m ✗`. Spinner cycles
  `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏` (TUI-instant feel per the design).
- **Completion (`BENCHMARK` block).** When `--compare=on`, the block
  shows:
  - per-arm glyph bar: `with_skill` (green) and `without_skill` (orange)
    with case counts
  - the `Δ +33.3%` (or actual delta) figure in `--tt-fg` 24px / 700
  - exit code (00 for clean), artifact path (relative to the
    workspace), and an `inspect in browse →` link that opens
    `browse` at the same run id

## Composer (hosted) — none

The composer exists only on localhost. Hosted replaces it with an
**Import Card** centered in the page.

### Import Card

`import evals.json` — dashed file target, paste textarea, `validate`
and `sample` buttons in a footer row.

- **File drop:** accepts `evals.json` directly (per the design
  README) plus a tar/gzip bundle of an `evals-runs/<id>/` artifact
  tree; the latter is what `review` imports.
- **Paste textarea:** accepts the same two formats pasted as text.
- **`validate`** runs the same loader/validator the Runtime uses
  ([`src/evals/loader.ts`](../../src/evals/loader.ts)); emits a
  check-list of results, the leading line being
  `✓ arc-skill-eval can run this — N cases` on success.
- **`sample`** populates the textarea with a short example (the
  smallest valid `evals.json`; the design README references one).

After a successful import, the section header gains a small
`run-import-2025-…` chip; clicking it jumps to `review` for the
imported bundle.

## Empty State Hero (both variants when no data)

- **Hosted, no imports yet:** 560px card centered, headline
  `localhost only`, supporting copy pointing at the install/run
  commands and a `Reset hosted data` link per
  [`persistence-spec.md`](./persistence-spec.md).
- **Localhost, no workspace selected:** the same shape, with the
  supporting copy explaining that `run` needs a workspace and pointing
  at the **Workspace Picker**.

## Run lifecycle state machine

`idle` → `running` → `done`. Stored in the global app store per
[`docs/web-app/CONTEXT.md`](./CONTEXT.md)'s `App Section` state
description: `runLifecycle ∈ {idle | running | done}`, plus
`progressRows: ProgressRow[]`, `elapsedSec`, `runId`.

State transitions:

| From | To | Trigger | Side effects |
|---|---|---|---|
| `idle` | `running` | `▶ run --compare` click | spinner, append first progress row at `t=0`, post `POST /runs` to the CLI daemon |
| `running` | `done` | daemon reports `completed` (per-case ack, then summary) | freeze progress rows, reveal `BENCHMARK` block, write `preferences.lastRunId` to IndexedDB |
| `done` | `idle` | `↻ reset` click or 30s after completion | clear progress rows, hide `BENCHMARK`, restore composer enabled state |

`running` is the only state during which `Esc` cancels (sends `DELETE
/runs/:id` to the daemon and transitions back to `idle` after the
daemon confirms).

## Keybinds

| Key | Action |
|---|---|
| <kbd>1</kbd>–<kbd>5</kbd> | switch App Section (inherited) |
| <kbd>Esc</kbd> | close any expanded Composer Row; if none, cancel `running` |
| <kbd>↑</kbd>/<kbd>↓</kbd> | move focus between Composer Rows |
| <kbd>Enter</kbd> on a row | expand it (collapse any other) |
| <kbd>Tab</kbd> | cycle through open dropdown's options |
| <kbd>Cmd/Ctrl</kbd>+<kbd>Enter</kbd> | fire the run (matches the primary button) |

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md)
  — Vite + React + TS; Composer + Console = the canonical two-panel
  layout pattern (also used by `browse` and `review`).
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md)
  — hosted has no LLM; `import evals.json` is the expression of that.
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md) —
  spinners + glyphs read theme roles; theming never remounts.
- [`docs/web-app/CONTEXT.md`](./CONTEXT.md) — `App Section`,
  `Composer Row`, `Workspace Picker`, `Benchmark Delta`, `Import Card`,
  `Empty State Hero`, `Install Command Pill`.
- [`decisions/workspace-picker.md`](./decisions/workspace-picker.md) —
  the localhost CLI daemon is the channel for `POST /runs` and
  `DELETE /runs/:id`.
- [`decisions/hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
  — `run (localhost)` vs `run (hosted)` are structurally distinct
  sections; the consumer never mixes the two.
- [`persistence-spec.md`](./persistence-spec.md) — `preferences.lastRunId`
  persists across sections; `Reset hosted data` clears hosted imports.
- Issues: [#170](https://github.com/andysolomon/arc-skill-eval/issues/170)
  (this `run` spec) · [#171](https://github.com/andysolomon/arc-skill-eval/issues/171)
  (`browse` spec — consumer of the `BENCHMARK` artifact path) ·
  [#172](https://github.com/andysolomon/arc-skill-eval/issues/172)
  (`create` spec — produces the `evals.json` the composer runs against)
  · [#173](https://github.com/andysolomon/arc-skill-eval/issues/173)
  (`review` spec — consumer of `grading.json` artifacts) ·
  [#175](https://github.com/andysolomon/arc-skill-eval/issues/175)
  (final README indexes this spec).
