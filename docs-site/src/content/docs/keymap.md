---
title: Keybindings
description: Every keystroke in the arc-skill-eval browse TUI. Generated from src/tui/keymap.ts — do not edit by hand.
---

> This page is generated from `src/tui/keymap.ts` by `scripts/gen-keymap-docs.mjs`.
> The in-TUI help overlay (`?`) renders from the same source, so the two cannot drift.

### Navigation

| Key | Action |
| --- | --- |
| `↑ ↓ j k` | Move the selection in the focused panel |
| `tab ⇧tab` | Focus the next / previous panel |
| `1 – 4` | Jump to Skills / Cases / Assertions / Runs |
| `g G` | Jump to top / bottom of the list |
| `q ctrl-c` | Quit |

### Detail pane

| Key | Action |
| --- | --- |
| `→ l ↵` | Drop a cursor into the detail pane (scroll follows it) |
| `↵` | Drill the cursor item into its side panel _(in pane)_ |
| `← h esc` | Leave the detail-pane cursor |
| `PgUp PgDn ⌃u ⌃d` | Scroll the detail pane |
| `[ ]` | Cycle case mode: Overview · Response · Diff · Trace · Context · Raw _(Cases)_ |
| `v` | Jump to raw grading.json _(Cases)_ |

### Run & author

| Key | Action |
| --- | --- |
| `r` | Run evals for the selection in-TUI (live spinner, Ink stays mounted) |
| `R` | Run with --compare (with_skill vs without_skill) |
| `o` | Run with custom flags (--model, --iteration, --extra-skill…) |
| `n` | Author a new eval case (id, prompt, typed assertions) → evals.json _(Skills/Cases)_ |
| `C` | Guided create: propose, review & write an eval suite for the skill _(Skills)_ |
| `f` | Write a feedback.json note for the case (feeds improve) _(Cases)_ |
| `esc` | Abort an in-flight run _(running)_ |
| `↵` | Reload artifacts & close the run console _(run complete)_ |

### Filter & compare

| Key | Action |
| --- | --- |
| `/` | Filter skills + cases (type, ↵ apply, esc clear) |
| `F` | Toggle failures-only |
| `s` | Cycle skill sort: name · pass · delta · cost |
| `c` | Pin a run as the cross-iteration baseline _(Runs)_ |
| `?` | Toggle this help overlay |
