# Web App Context

The Vite + React hosted web app for `arc-skill-eval`. Five sections (`run`, `browse`,
`create`, `review`, `learn`), three themes (tokyonight default, gruvbox, nord), each section
renders both a localhost and a hosted variant. Source of truth for layout/behavior is the
prototype at `docs/Arc skill eval web design/design_handoff_arc_skill_eval/arc-skill-eval-app.dc.html`;
the design system source of truth is `design.md` in the same directory.

## Stack

Vite + React 18 + TypeScript (strict). Tailwind config mapped from the shared
`@arc-skill-eval/tokens` package. Zustand for app-level state. *(See ADR-0002 once it lands.)*

## Language

**App Section**:
One of `run`, `browse`, `create`, `review`, `learn`. Each renders the same global chrome
(50px header, 25px status bar, 16px page padding) and a section-specific two-or-three-panel
content layout. Sections are switched by the `1`–`5` keyboard shortcuts or the header nav.
_Avoid_: page, screen, route, view.

**Env Variant**:
Each App Section renders twice — `localhost` (reads local `evals-runs/` from disk and may
invoke the Runtime CLI) and `hosted` (imports JSON instead of files, no filesystem, no LLM
execution). The active variant is a top-level state and is reflected in the
`data-screen-label` attribute for testing.
_Avoid_: mode, environment, scope.

**Theme Variant**:
One of `tokyonight` (default), `gruvbox`, `nord`. Implemented as a `[data-theme]` attribute
on `<html>`; token files swapped; no layout changes between themes.
_Avoid_: skin, palette, color scheme.

**Workspace Picker**:
A 30px outlined pill in the global header, open in localhost mode only. Drops into a 288px
panel showing favorites, a dashed `choose a folder…` target, and a skills-found list. The
hosted variant hides the picker entirely; the install-command pill remains.
_Avoid_: directory picker, folder chooser, workspace selector.

**Install Command Pill**:
Single-line copy-paste command in the header (default: `$ npm i -g arc-skill-eval`) with
click-to-copy feedback (`copied ✓` for ~1.5s). The same surface works for the install
instructions shown on hosted empty-state heroes.
_Avoid_: command pill (incomplete), copy button.

**Composer Row**:
Field row in the `run` composer — label-left (`--tt-comment`), value-right in the field's
accent color (e.g. `--tt-magenta` for `--compare`, `--tt-cyan` for `--context-mode`), with a
small chevron. Clicking expands one row at a time into an inline option dropdown
(`openField`). Only one row may be expanded at a time.
_Avoid_: input row, flag row, field.

**Benchmark Delta**:
The `Δ` figure revealed at the end of a compare run — e.g. `Δ +33.3%`. Computed from
per-case `with_skill` vs `without_skill` pass rates aggregated into `benchmark.json`. Always
accompanied by the per-arm glyph bars and the artifact path.
_Avoid_: score, improvement.

**Import Card**:
A centered dashed-target card used on hosted variants of `run` and `review`. Accepts the
relevant JSON (`evals.json` for `run` import; an artifact bundle for `review`) via file drop,
paste textarea, or a `validate` button. Shows check-list results including a
`✓ <context> can run this — N cases` success line.
_Avoid_: uploader, drop zone, json paste.

**Empty State Hero**:
A 560px-wide card shown when a section has no actionable data — either a hosted section
with no imported JSON, or a localhost section with no workspace dir. Carries the
`localhost only` headline, supporting copy, and install/run command blocks.
_Avoid_: empty state, no-data screen, hero card (collision with marketing connotation).

**Step Rail**:
A 214px left column on `create`. Renders `NEW EVAL SUITE`, four numbered steps with
selection bar, and a footnote *mirrors the learn flow*. Selection is *one* of four.
_Avoid_: stepper, wizard nav, breadcrumbs.

**Live Preview**:
A 344px right column on `create`. Renders the in-progress `evals/evals.json` with syntax
highlighting and a green `live` dot in the top-right. Updates as the user types in the
working pane (no debouncing; the dot indicates liveness).
_Avoid_: code preview, JSON viewer.

**Section Kicker**:
ALL-CAPS, 11–12px, 700 weight, `letter-spacing: 0.05–0.08em`. In `--tt-cyan` for content
section heads (`STEP 01`, `CHAPTER 02`, `PROMPT`, `GRADING`) and `--tt-comment` for nav-rail
kicks (`NEW EVAL SUITE`, `CHAPTERS`). These two color uses are deliberate.
_Avoid_: heading, label.

**Improve Plan**:
The right-rail panel on `review` describing proposed changes derived from recorded
`feedback.json` notes. Renders as a list of before/after diff items with rationale. The
`propose changes` magenta button produces the plan; nothing is applied without an explicit
`--apply` action. In a browser context, "apply" means download/inspect — never silent
filesystem writes.
_Avoid_: diff view (collision with Detail · Diff tab), suggestion list.

**Feedback Note**:
A single user-entered observation recorded against a review case (text-only, with a yellow
left-border accent). Persisted in the IndexedDB `feedback` store alongside the run id and
case id it refers to. Drives the `Improve Plan`.
_Avoid_: comment, annotation.

## Relationships

- An **App Section** is rendered in exactly one **Env Variant** at a time, themed in exactly
  one **Theme Variant** at a time. Both variants are user-switchable; both are persisted in
  IndexedDB on hosted.
- `run` and `browse` feature an **Empty State Hero** whenever they have no actionable data
  for the current env. `run` and `review` host the **Import Card** instead when hosted.
- A **Composer Row** expands at most once per page; clicking another row collapses the first.
- A **Benchmark Delta** is the closing act of a `run`; it appears only on completion and
  points at the artifact dir consumed by `browse`.
- A **Feedback Note** may exist without an **Improve Plan**, but an **Improve Plan** is
  derived from one or more notes.
- The **Workspace Picker** is hidden when the active **Env Variant** is hosted.

## Example dialogue

> **Implementer:** "In the `run` composer, where do I draw the `--context-mode` accent?"
>
> **Spec owner:** "On the **Composer Row**'s value column. Use `--tt-cyan` for `--context-mode` —
> the **Section Kicker** in `design.md §1.2` pins that role to cyan."
>
> **Implementer:** "Where does the helper `copied ✓` text come from?"
>
> **Spec owner:** "It's the click-to-copy feedback on the **Install Command Pill**. Spec at
> `docs/web-app/interactions.md` once Ticket 7 lands."

## Flagged ambiguities

- "Variant" alone is ambiguous — say `Env Variant` or `Theme Variant` explicitly.
- "Section" is overloaded with `review`'s per-case cards; say `App Section` for the top-level
  `run | browse | create | review | learn` axis, and `Case Card` (defined per-ticket in
  Ticket 10) for in-section cards.
- "Tokens" without a qualifier could mean design tokens or a *runtime* thing; if the
  audience is implementers, prefer `Design Tokens` until the project settles.

## Provenance

Terms in this glossary are derived from the design handoff at
`docs/Arc skill eval web design/design_handoff_arc_skill_eval/design.md` and the interactive
prototype at `arc-skill-eval-app.dc.html` in the same directory. New terms must trace back
to one of those sources, or be added with a clear rationale here.
