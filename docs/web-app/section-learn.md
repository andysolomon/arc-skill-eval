# `learn` section spec

## Status

Draft (2026-07-22) — closes #174. Consumes ADR-0002 (stack), ADR-0004
(hosted persistence boundary), ADR-0006 (theme integration), and the decision
docs [`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
and [`persistence-spec.md`](./persistence-spec.md). No runtime code in this
ticket; this is the dev-handoff contract for the `learn` **App Section**.

## Overview

`learn` is the in-product teaching surface for `arc-skill-eval`: a chapter
reader that explains how the Anthropic `evals.json` format, OpenAI-style
eval-skills method, and Pi runtime fit together. It is not a marketing page,
not a reference dump, and not an execution surface. The reader should make a new
author productive enough to inspect a skill, write a small eval suite, run it
with and without the skill loaded, and interpret the resulting artifacts.

`learn` renders in exactly one **Env Variant** (`localhost` | `hosted`) and one
**Theme Variant** (`tokyonight` | `gruvbox` | `nord`) at a time, inside the
global chrome (50px header, 25px status bar, 16px page padding) defined in
[`CONTEXT.md`](./CONTEXT.md). Unlike `run` and `browse`, `learn` has full parity
across envs: both localhost and hosted render the same chapter reader, and
neither env shows a full-section **Empty State Hero**
([`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)).

Progress is local browser state. The section may persist the active chapter,
reader position, and completion state through the `learnProgress` IndexedDB
store defined in [`persistence-spec.md`](./persistence-spec.md), but it must not
write eval artifacts, invoke the Runtime CLI, upload data, or require accounts.

## Layout

Two content panels fill the content area below the global chrome:

```
┌────────────────────────┬──────────────────────────────────────────────────┐
│ Chapter Rail (238px)   │ Content Pane (fills)                              │
│                        │                                                  │
│ CHAPTERS               │ CHAPTER 03                                       │
│ 01 Overview          ● │ Creating an eval                                  │
│ 02 Anatomy of a skill  │                                                  │
│ 03 Creating an eval  ▌ │ <MDX article content>                             │
│ 04 Writing assertions  │                                                  │
│ 05 With/without signal │ format · Anthropic evals.json / method · ...     │
│ 06 Anatomy of a run    │                                                  │
│ 07 The Pi runtime      │                                                  │
└────────────────────────┴──────────────────────────────────────────────────┘
```

### Chapter Rail

The Chapter Rail is a fixed 238px left column. It renders the `CHAPTERS`
**Section Kicker** in `--tt-comment`, then exactly seven chapter rows in the
canonical order from the design handoff README's `### 5. learn` section:
overview, anatomy of a skill, creating an eval, writing assertions, with/without
signal, anatomy of a run, the Pi runtime. The active row carries the cyan
selection bar; completed rows may show a small completion glyph, but completion
must not be the only active-state signal.

Chapter rows are single selection controls, not cards. Each row shows a
two-digit chapter number and short title. Titles may wrap to two lines only when
the rail is constrained; the rail width remains 238px and must not resize based
on title length. The rail scrolls independently if future chapter metadata makes
it taller than the content area, but v0 has exactly seven rows.

### Content Pane

The Content Pane fills the remaining width and renders one MDX chapter at a
time. At the top it shows a cyan **Section Kicker** (`CHAPTER 01` through
`CHAPTER 07`), then the chapter title, then article content. The body should use
the app's readable prose measure, not full-width paragraphs across the pane.
Examples, code blocks, and callouts may extend wider than prose when useful, but
they stay inside the pane and scroll horizontally only for long code.

At the bottom of each chapter, render the provenance footer exactly as specified
in MDX Authoring Conventions. Deep-dive links live near the relevant paragraph,
not as a generic link farm at the bottom. The reader may expose previous/next
chapter controls after the footer; those controls are secondary to the Chapter
Rail and must preserve the same canonical chapter order.

### Env and Persistence

`learn` uses the same localhost and hosted branch labels as other sections:
`data-screen-label="learn (localhost)"` and `data-screen-label="learn (hosted)"`.
The rendered content is identical in both branches. The **Workspace Picker** is
hidden on hosted per the shared header rule, but `learn` content does not depend
on a workspace.

Persist progress by `chapterId` in `learnProgress` when available:

- `chapterId`: stable slug, e.g. `chapter-03-creating-an-eval`.
- `position`: scroll offset or heading index; implementation must choose one
  unit and keep it stable.
- `completed`: true only after the user reaches the chapter footer or explicitly
  marks the chapter complete.

## Chapter Outlines

Each chapter is authored as MDX under `docs/web-app/learn/` and loaded into the
reader without changing the chapter order below. The outline paragraphs are the
content contract for v0; authors can deepen examples, but should not replace the
chapter's job.

### 1. Overview

Introduce the product loop: pick a skill, describe behavior worth measuring,
write `evals.json`, run the suite, compare with and without the skill, then
review failures into an Improve Plan. Name the three anchors that will repeat
through the series: `format` is Anthropic `evals.json`, `method` is OpenAI
eval-skills, and `runtime` is Pi.

Set expectations about what this tool can and cannot prove. A passing eval is
evidence about the cases it covers, not a universal guarantee; a failing eval is
useful when it points to a concrete missing behavior, ambiguous prompt, or weak
assertion. End by linking readers to the deeper chapters for each concept.

### 2. Anatomy of a skill

Explain the target under test: a skill is a bounded instruction package, usually
centered on `SKILL.md`, optional references, scripts, templates, or assets. Show
how a skill creates behavior through triggers, constraints, examples, and
workflow steps, and why eval authors should test observable outcomes rather than
the mere presence of files.

Teach readers to identify the behavior contract before writing cases. The useful
question is not "did the model read the skill?" but "did the skill change the
agent's answer, file edits, tool use, or decision path in the way the skill
promises?" Use this chapter to introduce distractor skills and the difference
between skill engagement evidence and outcome evidence.

### 3. Creating an eval

Walk through the shape of an `evals.json` suite: suite identity, cases, prompts,
fixture or context setup, expected behavior, and assertions. Emphasize small
case sets that isolate one behavior at a time, with names that explain the
scenario instead of the implementation.

Describe the authoring path from a manual example to a runnable suite. Start
with one representative case, run it, inspect the actual response/artifacts, and
only then add more cases. The chapter should make the generated JSON feel like a
document an author owns, not a magic output from the app.

### 4. Writing assertions

Define assertions as the bridge between human expectations and deterministic
grading. Explain that assertions should look for concrete evidence in the
assistant response, produced files, JSON artifacts, tool summaries, or trace
events. Prefer assertions that test effects over assertions that test prose
about effects.

Cover failure modes: brittle exact text checks, assertions against imagined
model wording, missing negative assertions, and checks that pass even when the
skill did not matter. Readers should leave this chapter with a bias toward
observable artifacts, narrow regex or JSON checks, and evidence-rich failure
messages.

### 5. With/without signal

Explain the comparison run as the method for separating general model ability
from skill-specific lift. `with_skill` runs with the target skill available;
`without_skill` runs without that skill while keeping the case, model, and
runtime settings aligned. The useful output is the delta between arms, not a
single absolute score.

Teach the caveats. A positive delta is strongest when the skill was actually
needed by the task, assertions measure the promised behavior, and both arms have
the same opportunity to solve the case. A flat or negative delta can mean the
skill is ineffective, the eval is too easy, the prompt leaks the answer, or the
assertion is not aimed at the skill's value.

### 6. Anatomy of a run

Describe the artifact bundle produced by a run: assistant output, grading
results, timing and token metadata, trace data, tool summaries, context
manifest, and `benchmark.json` for compare runs. Tie those artifacts to the
`browse` and `review` sections: `browse` answers what happened, while `review`
records feedback and proposes changes.

Explain the reading order for a failed case. Start with the grading summary,
then inspect the assistant answer, then compare trace/tool evidence against the
skill contract, and finally inspect raw JSON when the shaped surfaces do not
explain the failure. This chapter should make run artifacts feel inspectable
rather than opaque.

### 7. The Pi runtime

Explain Pi as the execution runtime that gives the eval suite an agent session
with tools, context, and trace capture. The chapter should cover the role of
eval-owned runtime configuration, model/provider selection, injected sessions
for tests, and why runtime behavior is part of the evidence chain.

Keep the boundary clear: `learn` teaches the runtime, but does not execute it.
Execution belongs to `run`; artifacts are read by `browse`; feedback is written
in `review`. End the chapter by showing how the provenance footer's `runtime ·
Pi` claim connects the teaching content back to the runtime artifacts readers
see elsewhere in the app.

## MDX Authoring Conventions

### File location

Chapter files live under:

```text
docs/web-app/learn/
```

Use this file path pattern:

```text
docs/web-app/learn/chapter-XX-<slug>.mdx
```

Examples:

```text
docs/web-app/learn/chapter-01-overview.mdx
docs/web-app/learn/chapter-05-with-without-signal.mdx
docs/web-app/learn/chapter-07-the-pi-runtime.mdx
```

`XX` is a zero-padded chapter number. `<slug>` is lowercase kebab case and must
match the Chapter Rail title.

### Required frontmatter

Every chapter MDX file must include:

```yaml
---
id: chapter-01-overview
order: 1
title: Overview
description: One-sentence summary used by the Chapter Rail and metadata.
provenance:
  format: Anthropic evals.json
  method: OpenAI eval-skills
  runtime: Pi
---
```

Required fields:

- `id`: stable chapter id, matching the file slug and `learnProgress.chapterId`.
- `order`: integer from `1` through `7`; the reader sorts ascending.
- `title`: visible chapter title; must match the Chapter Rail label.
- `description`: one sentence, no Markdown, suitable for metadata.
- `provenance.format`: always `Anthropic evals.json` for v0.
- `provenance.method`: always `OpenAI eval-skills` for v0.
- `provenance.runtime`: always `Pi` for v0.

### Provenance footer format

Every chapter must end with this footer line, using the exact separators and
labels:

```md
format · Anthropic evals.json / method · OpenAI eval-skills / runtime · Pi
```

The footer is the compact provenance claim for the chapter: `format · ...`
names the eval document format being taught, `method · ...` names the evaluation
methodology the chapter follows, and `runtime · ...` names the execution system
that produces the run evidence discussed in the app. If any future chapter has a
different source basis, update frontmatter and footer together.

### Deep-dive cross-linking

Use Markdown anchors for deep dives. Link from the sentence that introduces the
concept, not from a generic "see also" list:

```md
Write assertions against observable effects; see
[Writing assertions](./chapter-04-writing-assertions.mdx#assertions-as-evidence).
```

Anchor ids must be lowercase kebab case, stable, and owned by the destination
chapter. Prefer links across chapters when a concept needs more detail than the
current chapter should carry. Do not duplicate a deep-dive section in multiple
chapters; link to the canonical chapter instead.

Required cross-chapter deep dives:

- Chapter 1 links to all six later chapters from its closing orientation.
- Chapter 2 links to Chapter 5 when explaining skill-specific lift.
- Chapter 3 links to Chapter 4 for assertion details and Chapter 7 for runtime
  settings.
- Chapter 4 links to Chapter 6 when explaining where assertion evidence appears.
- Chapter 5 links to Chapter 6 for `benchmark.json` and run artifact inspection.
- Chapter 7 links back to Chapter 6 for runtime trace artifacts.

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md)
  — Vite + React + TS stack, Zustand `section`/`env` state, `1`-`5` routing, and
  MDX chapter-series allowance for `learn`.
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) — no-auth,
  single-user, IndexedDB persistence boundary; `learnProgress` is browser-local.
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md) — Tailwind v4 +
  `[data-theme]` token integration for reader typography, callouts, and code.
- [`docs/web-app/CONTEXT.md`](./CONTEXT.md) — glossary: App Section, Env
  Variant, Theme Variant, Section Kicker, Empty State Hero, Workspace Picker,
  Install Command Pill, Feedback Note, Improve Plan.
- [`decisions/hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
  — `learn` has localhost/hosted parity and no full-section env gate.
- [`persistence-spec.md`](./persistence-spec.md) — `learnProgress` store for
  active chapter, reader position, completion state, and hosted reset behavior.
- Iteration issues:
  [#164](https://github.com/andysolomon/arc-skill-eval/issues/164)
  (`@arc-skill-eval/tokens` package contract) ·
  [#166](https://github.com/andysolomon/arc-skill-eval/issues/166)
  (Tailwind + `[data-theme]`) ·
  [#167](https://github.com/andysolomon/arc-skill-eval/issues/167)
  (Workspace Picker mechanism) ·
  [#168](https://github.com/andysolomon/arc-skill-eval/issues/168)
  (hosted empty-state gating) ·
  [#169](https://github.com/andysolomon/arc-skill-eval/issues/169)
  (IndexedDB persistence) ·
  [#171](https://github.com/andysolomon/arc-skill-eval/issues/171)
  (`browse` section spec) ·
  [#172](https://github.com/andysolomon/arc-skill-eval/issues/172)
  (`create` section spec) ·
  [#173](https://github.com/andysolomon/arc-skill-eval/issues/173)
  (`review` section spec).
