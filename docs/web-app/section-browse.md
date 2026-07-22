# `browse` section spec

## Status

Draft (2026-07-22) — closes #171. Consumes ADR-0002 (stack), ADR-0004 (hosted
persistence boundary), ADR-0006 (theme integration), and the decision docs
[`workspace-picker.md`](./decisions/workspace-picker.md),
[`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md), and
[`persistence-spec.md`](./persistence-spec.md). No runtime code in this ticket;
this is the dev-handoff contract for the `browse` **App Section**.

## Overview

`browse` is the read-only artifact browser for completed eval runs. It reads the
per-case artifact tree the Runtime CLI writes under `<skillDir>/evals-runs/…`
(`assistant.md`, `grading.json`, `trace.json`, `tool-summary.json`,
`timing.json`, `context-manifest.json`, and — for `--compare` runs —
`with_skill/` + `without_skill/` + `benchmark.json`; see
[`docs/domain-model.md`](../domain-model.md) § Run Artifacts). It answers *"what
did this run actually do, and did it pass?"* after `run` produces the artifacts
and before `review` records **Feedback Notes** against them.

`browse` renders in exactly one **Env Variant** (`localhost` | `hosted`) and one
**Theme Variant** (`tokyonight` | `gruvbox` | `nord`) at a time, inside the
global chrome (50px header, 25px status bar, 16px page padding) defined in
[`CONTEXT.md`](./CONTEXT.md). Per the gating decision, `localhost` is the primary
capability side (it reads local run artifacts from disk); `hosted` has no
filesystem and shows an **Empty State Hero** instead
([`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md) §
(c/d)).

- **localhost** — the full artifact browser (this spec's Layout section).
- **hosted** — the `browse reads local run artifacts` **Empty State Hero** (this
  spec's Hosted variant section). No import path for `browse` in v0.

The env is declared exactly once via the Zustand `env` store and the app-root
`data-env` attribute; `browse` must not invent a second env signal
([`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md) §
(a)). Handoff parity: set `data-screen-label="browse (localhost)"` and
`"browse (hosted)"` on the two branches so prototype-driven tests can target each.

## Layout (localhost)

Three content panels in a master → detail arrangement, left to right, filling the
content area below the global chrome:

```
┌────────────┬──────────────────┬──────────────────────────────────────────┐
│ Runs Rail  │  Case List       │  Detail Pane                               │
│ (214px)    │  (280px)         │  (fills)                                   │
│            │                  │  ┌ Variant switch: with_skill │ without ┐ │
│ run_…_a ●  │  case_summar… ✓  │  ├ Mode Tabs: Overview Response Diff …   ┤ │
│ run_…_b    │  case_lint…   ✗  │  │                                        │ │
│ run_…_c    │  case_pr…     ✓  │  │  <active tab rendering surface>        │ │
│            │                  │  │                                        │ │
└────────────┴──────────────────┴──────────────────────────────────────────┘
```

1. **Runs Rail** (left, ~214px). Vertical list of run ids discovered under the
   active workspace's `evals-runs/` (and `iteration-<N>/` groupings). Each row
   shows the run id, a compact pass-glyph summary, and — for `--compare` runs —
   the **Benchmark Delta** `Δ` figure (`CONTEXT.md` **Benchmark Delta**).
   Selection is one run at a time; the active row carries the cyan selection bar.
   The workspace itself arrives from the **Workspace Picker** CLI handshake
   ([`workspace-picker.md`](./decisions/workspace-picker.md)) — `browse` consumes
   `workspace path + runs list`, it does not pick directories.

2. **Case List** (middle, ~280px). The eval cases inside the selected run. Each
   row is a **Case Card**-style entry: case id / slug plus a pass (`✓`
   `--tt-green`) or fail (`✗` `--tt-red`) glyph derived from `grading.json`
   `summary`. `j`/`k` move the selection; the highlighted case drives the Detail
   Pane. One case selected at a time.

3. **Detail Pane** (right, fills). Renders the selected case. Two controls stack
   at the top:
   - **Variant switch** — `with_skill` │ `without_skill` toggle, shown only for
     `--compare` runs (a single-run case has one variant and hides the switch).
     It re-points every Mode Tab at the chosen variant's artifact directory.
   - **Mode Tabs** — `Overview` · `Response` · `Diff` · `Trace` · `Raw`. Exactly
     one tab is active; each renders its own surface over the same selected
     `(run, case, variant)` artifacts (see Mode tabs below).

> **Panel-count reconciliation.** The gating decision table calls `browse`
> localhost a *"Four-panel artifact browser"*
> ([`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md) §
> (d)). That shorthand counts the Detail Pane's **Variant switch** column as its
> own panel. This spec treats it as a sub-control of the Detail Pane, so the
> canonical count here is **three content panels** (Runs Rail, Case List, Detail
> Pane). Both descriptions denote the same layout; implementers should follow the
> three-panel structure and the named surfaces.

Empty/partial states inside the allowed localhost surface stay inline per
`design.md` (a dashed box / one-line sentence — e.g. *"no runs in this
workspace yet"* in the Runs Rail when `evals-runs/` is empty but the daemon is
reachable). The full-card **Empty State Hero** is reserved for the disallowed
hosted env only, never as a generic "no rows yet" placeholder
([`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md) §
(c)).

## Mode tabs (Detail Pane)

All five tabs read the selected `(run, case, variant)` artifact set. The tab bar
uses the **Section Kicker** cyan role for the active tab; per-tab section heads
(`PROMPT`, `GRADING`, …) also use `--tt-cyan` (`CONTEXT.md` **Section Kicker**).

### Overview

The default tab and the case-at-a-glance surface. It mirrors the design handoff
README's **"Overview"** description — a stacked read of **PROMPT** → **EXPECTED**
→ **GRADING**, followed by **METRICS** and (for compare runs) **COMPARE**.
`PROMPT` renders the case prompt/instruction; `EXPECTED` renders the case's
declared assertions/expectations from `evals.json`; `GRADING` renders the
`grading.json` `summary` plus each `assertion_results[]` entry as a pass/fail row
with its `text` and `evidence` (Anthropic-style; *"require concrete evidence for
a PASS"*).

**METRICS** summarizes `timing.json`: duration, model provider/id, thinking
level, input/output/cache/total tokens, estimated USD cost, and context-window
usage. **COMPARE** appears only for `--compare` runs and renders the case-level
`with_skill` vs `without_skill` pass rates with the per-case delta and the
per-arm glyph bars, tracing up to the run's **Benchmark Delta**
(`benchmark.json`). Overview is the jumping-off point; deeper reads live on the
other four tabs.

### Response

Renders the assistant's final answer for the active variant — the lines of
`assistant.md` — as formatted Markdown in a scrollable reading column. This is
the "what did the model say" surface, distinct from the grading verdict on
Overview. Long responses scroll within the Detail Pane; the Runs Rail and Case
List stay fixed. When `assistant.md` is empty or missing for a variant, show the
inline dashed empty sentence rather than a blank pane. No editing — `browse` is
read-only; authoring/《apply》 semantics belong to `review`.

### Diff

Renders a line-oriented diff of the run's produced output against the expected /
baseline text, with `+`/`-` rows tinted — additions in `--tt-green`, deletions in
`--tt-red`, context rows in `--tt-fg` on the default surface. For `--compare`
runs the natural diff is `without_skill` → `with_skill` `assistant.md` (or the
`outputs/` snapshot), making the skill's effect legible line by line; for a
single-run case it diffs produced vs expected. Row tinting is the whole point of
the tab, so gutters carry the `+`/`-` sign and the tint together for
color-independent legibility. This is the Detail·Diff surface the glossary flags
as distinct from `review`'s **Improve Plan** diff items (`CONTEXT.md`
**Improve Plan** *Avoid* note).

### Trace

Renders the runtime activity from `tool-summary.json` (with `trace.json` as the
deep source). Three stacked reads: (1) a **tool-call bar chart** of counts by
tool name, longest bar first, tool errors flagged; (2) a **skill reads** list —
skills read by name (the target skill vs any `--extra-skill` distractors, cross-
checked against `context-manifest.json`); and (3) an **external calls** list —
external / MCP-looking tool calls and written/edited files. This is the "what did
the agent *do*, not just say" surface and is the fastest way to spot a run that
passed for the wrong reasons (e.g. never read the skill). Bars use a single
accent from the active theme; counts are labeled numerically so the chart reads
without relying on width alone.

### Raw

Renders the underlying JSON artifact for the active `(run, case, variant)` with
syntax highlighting — `grading.json` by default (the grading verdict backing
Overview), with the pane able to switch to the sibling artifacts (`timing.json`,
`trace.json`, `tool-summary.json`, `context-manifest.json`, `benchmark.json`).
It is the escape hatch for anything the shaped tabs don't surface: pretty-printed,
read-only, copyable. Highlighting uses the token roles from the active Theme
Variant so the JSON matches the surrounding chrome across theme swaps
(ADR-0006).

## Hosted variant

Hosted `browse` has no filesystem and no Runtime CLI, so it cannot read
`evals-runs/`. Per [`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
§ (c/d), the section body is replaced by the centered 560px **Empty State Hero**
with the `browse reads local run artifacts` headline (there is no **Import Card**
for `browse` in v0 — artifact-bundle import lives on `review`). The
**Workspace Picker** is omitted on hosted (`visible = !hosted`); the
**Install Command Pill** remains in the header.

Drafted hero copy (headline pinned by the gating table; body + commands follow
the prototype and `CONTEXT.md` **Empty State Hero**):

- **Badge:** `localhost only`
- **Headline:** `browse reads local run artifacts`
- **Body:** `Browsing a run means reading the files an eval writes to disk —
  assistant.md, grading.json, trace and tool summaries. The hosted app has no
  filesystem, so run an eval locally, then browse it there.`
- **Command block — install + run + browse:**
  ```
  $ npm i -g arc-skill-eval
  $ arc-skill-eval run ./path/to/skill
  $ arc-skill-eval browse        # opens the localhost artifact browser
  ```
  (Install line reuses the **Install Command Pill** surface with `copied ✓`
  click-to-copy feedback.)
- **Escape hatch:** a link to the `review` section — *"Already have an artifact
  bundle? Import it in **review** →"* — since `review` is the hosted section that
  accepts artifact JSON via its **Import Card**.

**Persistence:** hosted `browse` persists only chrome preferences (Theme/Env)
through the `preferences` singleton store; it authors no `feedback` /
`improvePlans` records (those are `review`'s). The `Reset hosted data` control is
hosted-chrome affordance for `run` / `review`, not `browse`
([`persistence-spec.md`](./persistence-spec.md) § Stores / Reset & Privacy;
ADR-0004). IndexedDB contents are never written to disk and never uploaded.

## Keybinds

`browse` inherits the global chrome keymap and adds case navigation:

| Key | Action | Source |
|---|---|---|
| `j` / `k` | Move Case List selection down / up (drives the Detail Pane) | `browse` (selection-navigation) |
| `1`–`5` | Switch **App Section** (`run`/`browse`/`create`/`review`/`learn`) | inherited global (ADR-0002 § routing; `CONTEXT.md` **App Section**) |

- `j`/`k` and `1`–`5` are the required v0 binds. `1`–`5` is the inherited global
  App-Section switch (a thin wrapper over the route change + state sync,
  ADR-0002 § 4); `browse` must not rebind those digits locally.
- Mode-tab switching (Overview/Response/Diff/Trace/Raw) and the Variant switch
  are pointer-driven in v0. A keyboard tab-cycle (e.g. bracket keys) is a
  proposed enhancement, not a v0 requirement; it must not collide with the
  inherited `1`–`5` section binds if added later.

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md)
  — Vite + React + TS stack, Zustand `section`/`env` state, `1`–`5` routing.
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) — no-auth,
  single-user, IndexedDB persistence boundary; hosted has no filesystem/LLM.
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md) — Tailwind v4 +
  `[data-theme]` token integration (Raw highlighting + tinting read theme roles).
- [`docs/web-app/CONTEXT.md`](./CONTEXT.md) — glossary: App Section, Env Variant,
  Theme Variant, Empty State Hero, Workspace Picker, Install Command Pill,
  Benchmark Delta, Section Kicker, Improve Plan (Diff *Avoid* note).
- [`persistence-spec.md`](./persistence-spec.md) — IndexedDB stores; `browse`
  writes only `preferences`; Reset & Privacy stance.
- [`decisions/hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
  — env gating: `browse` hosted → Empty State Hero (`browse reads local run
  artifacts`); Workspace Picker `visible = !hosted`.
- [`decisions/workspace-picker.md`](./decisions/workspace-picker.md) — CLI
  localhost handshake that supplies the workspace path + runs list `browse` reads.
- [`docs/domain-model.md`](../domain-model.md) — Run Artifacts (`assistant.md`,
  `grading.json`, `trace.json`, `tool-summary.json`, `timing.json`,
  `benchmark.json`) the tabs render.
- Issues: [#171](https://github.com/andysolomon/arc-skill-eval/issues/171) (this
  `browse` spec) · [#172](https://github.com/andysolomon/arc-skill-eval/issues/172)
  (`create` spec) · [#173](https://github.com/andysolomon/arc-skill-eval/issues/173)
  (`review` spec — artifact-bundle Import Card, `feedback`/`improvePlans`) ·
  [#175](https://github.com/andysolomon/arc-skill-eval/issues/175) (final README).
