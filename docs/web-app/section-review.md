# `review` section spec

## Status

Draft (2026-07-22). Closes #173. Depends on ADR-0002 (stack), ADR-0004
(hosted persistence boundary + no silent writes), ADR-0006 (theme
integration), [`persistence-spec.md`](./persistence-spec.md) (the
`feedback` and `improvePlans` IndexedDB stores), and the decision docs
[`workspace-picker.md`](./decisions/workspace-picker.md) and
[`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md).

## Overview

`review` reads the
`grading.json`, `benchmark.json`, and `feedback.json` artifacts (the
first two from the Runtime's run tree, the third from the user's notes
during this section) and turns notes into an **Improve Plan**
the user can take to the `create` wizard. `review` is read-mostly
locally; on hosted it gains an import card that lets the user import
an artifact bundle (a tar/gzip of an `evals-runs/<id>/` tree) for
review without a local run.

`review` renders in exactly one **Env Variant** and one **Theme Variant**
at a time.

## Layout

Three columns, 16px page padding, 14px gap.

| Column | Width | Role |
|---|---|---|
| Runs | 250px (fixed) | List of completed runs as Run Cards |
| Summary | flex | Per-case cards for the selected run (the headline section) |
| Feedback + Improve | 360px (fixed) | Feedback Notes list + Improve Plan rail |

Plus a one-line Env strip across the top on `localhost`:
`localhost reading ~/…/evals-runs from disk.` (per the design README).

## Runs column (250px)

Stacked **Run Cards**. Each card reads:
- A status dot (green if all pass, red-tinted if any fail, gray if partial)
- The `runId` (yellow `e0af68`-style, monospace, truncated to first 6 chars)
- Skill name (single line, ellipsized)
- Date (relative: `2h`, `3d`; hover for `2026-07-21 22:04Z`)
- A footer row: `✓ N/M` (passed/total), `Σ $0.87` (cost, when known),
  exit code `0` (or non-zero with red tint)

Failing run cards get a red-tinted background
(`--tt-red` 10% saturation tint over `--tt-bg`). The selected card
gets the bordered-with-selection-bar treatment from
[`docs/web-app/CONTEXT.md`](./CONTEXT.md)'s `App Section` description.

## Summary column (flex)

`review.html` header with the run-level pass count, e.g.
`passed 27 / 30 · failed 3`. Below, a stack of per-case **Case Cards**,
each:
- Glyph (✓ pass, ✗ fail, ◐ partial) + case id (yellow, monospace) +
  `Δ +33.3%` (or actual delta) tag
- A one-line prompt excerpt
- A `with_skill`/`without_skill` glyph bar pair (when `--compare=on`)
- For failing cases: a `failure evidence` block in `--tt-red` (`assistant.md`
  fragment + the assertion that fired)

Failing cards in the *currently selected* case get a red border + red
selection-bar so the user can scan a failing run at a glance.

## Feedback + Improve column (360px)

Two stacked panels.

### `feedback.json` panel

- A `note` textarea (2-3 rows visible, expands on focus).
- A `record feedback` button below the textarea. Disabled until the
  textarea has content. On click, appends a **Feedback Note** (yellow
  left border accent) to the panel and writes it to the IndexedDB
  `feedback` store (key `runId + caseId + noteId`) per
  [`persistence-spec.md`](./persistence-spec.md).

The recorded notes are listed below the textarea, newest first:
- `<timestamp> · <caseId>` (mono)
- The note body, one paragraph
- A `remove` (×) button on hover (with a confirm step)

### `improve --from-feedback` panel

- A static explainer: "We'll derive a proposed plan from your
  feedback notes against the eval suite + grading.json. Nothing is
  written without `--apply`."
- A `propose changes` magenta button. Disabled until at least one
  Feedback Note exists for the selected run.
- On click: derives an **Improve Plan** in-memory from the notes + the
  selected `evals.json`. The plan replaces the explainer with a list of
  `before -> after` diff items, each with a one-line rationale.
- The plan is *proposed only*: it does **not** mutate anything on
  disk or in IndexedDB until the user clicks `--apply`.
- Clicking `--apply` on `localhost` triggers the workspace-picker
  CLI daemon to receive the plan and stage it as a follow-up edit
  (see [Sub-decision: `--apply` semantics](#sub-decision---apply-semantics)).
  On `hosted` it triggers a JSON download (see ADR-0004's no-silent-write
  rule).

## Hosted variant: import card

On `hosted` mode (env segmented control), `review` opens with an
**Import Card** centered in the page, above the columns:

- Accepted-file chips: `evals.json`, `benchmark.json`, `grading.json`,
  a tar/gzip `evals-runs/<id>/` bundle
- Two targets: a dashed file drop area and the same paste textarea
- `inspect` button: validates and previews the bundle (case count,
  run id, pass counts) before it lands in the runs column
- `sample` button: preloads the design's example bundle

Once the bundle is imported, the columns populate as normal. The only
delta from the localhost view is the lack of a `--apply` triggering a
write to disk; on hosted, `--apply` always downloads.

## Sub-decision: `--apply` semantics

The `--apply` button is the only step in the entire web app that
mutates anything beyond IndexedDB. The implementer must respect the
following contract.

**Inputs.** The Improve Plan object (shape documented in the
[`persistence-spec.md`](./persistence-spec.md) `improvePlans` store
section) plus the workspace path (localhost only; for the
`workspace-picker` daemon channel).

**Localhost execution.** The web app POSTs the Improve Plan to the
workspace-picker daemon:

```http
POST /apply-plan
Content-Type: application/json

{ "skillPath": "<absolute>", "plan": { ... } }
```

The daemon writes the resulting edits in a temp staging area and
returns a `planId` plus the diff hunks. The web app then surfaces a
`review changes` link in the status bar that opens a `git diff`-style
viewer; only after the user clicks `commit` does the daemon finalize.
There is *no* auto-commit path on `localhost` either. Every apply
ends with `commit` as a separate gate.

**Hosted execution.** The web app triggers a JSON download:
`improve-plan-<skill>-<runId>-<timestamp>.json`. The user is free to
inspect the file, hand it to a teammate, and apply it later via the
local CLI (`arc-skill-eval improve --from-feedback <path>`).

**Atomicity.** Plan application is *all-or-nothing*: a partial apply
is a daemon error (`409 Conflict`, surfaced in the status bar as
`! apply failed: daemon rolled back`), and the Improve Plan stays in
`improvePlans` IndexedDB store so the user can retry.

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md):
  Vite + React + TS; the three-column layout pattern shared with
  `run` and `browse`.
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md):
  the no-silent-write rule that the `--apply` contract codifies.
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md):
  glyph colors are theme roles; failing-card red-tint derives from
  `--tt-red` 10% alpha.
- [`docs/web-app/CONTEXT.md`](./CONTEXT.md): `Feedback Note`,
  `Improve Plan`, `Empty State Hero` (for the empty case), `Env
  Variant`.
- [`decisions/workspace-picker.md`](./decisions/workspace-picker.md):
  supplies the `POST /apply-plan` channel and the workspace path on
  localhost.
- [`decisions/hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md):
  `review (localhost)` is a three-column reading surface; `review
  (hosted)` adds the import card.
- [`persistence-spec.md`](./persistence-spec.md): the `feedback` and
  `improvePlans` stores are the persistence boundary; `Reset hosted
  data` clears both.
- Issues: [#173](https://github.com/andysolomon/arc-skill-eval/issues/173)
  (this `review` spec) · [#170](https://github.com/andysolomon/arc-skill-eval/issues/170)
  (`run` spec — produces the artifacts `review` consumes) ·
  [#171](https://github.com/andysolomon/arc-skill-eval/issues/171)
  (`browse` spec — the dedicated reading surface for case-level
  evidence; `review` is the *feedback* surface) ·
  [#172](https://github.com/andysolomon/arc-skill-eval/issues/172)
  (`create` spec — receives the `--apply`'d plan when the user returns
  to author edits) · [#175](https://github.com/andysolomon/arc-skill-eval/issues/175)
  (final README indexes this spec).
