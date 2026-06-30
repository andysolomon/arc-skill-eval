---
title: Components & themes
description: The browse TUI's component catalog and theme palettes — panels, status bar, bars, the diff renderer, and the tokyonight / gruvbox / nord token sets.
---

The `browse` TUI is built from a small set of components rendered over a capability-aware token set (palette + glyphs). This page is the reviewable spec; the **interactive gallery** below is the visual reference, and [`src/tui/STYLE.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/src/tui/STYLE.md) is the source-of-truth that `theme.ts` / `caps.ts` implement and `tests/tui-components.test.mjs` pins.

## Interactive gallery

A standalone, clickable catalog of every component across all three themes:

👉 **[Open the TUI Component Gallery](/arc-skill-eval/component-gallery.html)**

> The gallery is a generated design snapshot (a DC export). It's a static visual reference — the authoritative, reviewable tokens live in `STYLE.md` and the conformance test, not in that file.

## Components

| Component | What it is |
| --- | --- |
| **Panel** | Rounded-border box with a `[n] Name` title (bold blue + `borderActive` when focused) and a count/position badge; holds a row list. |
| **RowList** | Selectable rows; the focused selection gets a `selection` background and an `accent` bar, and windows with `↑`/`↓` overflow markers. |
| **MainPane** | The right-hand detail pane — title + sub-header, free-scrolling body, and an in-pane cursor for drill-in. |
| **StatusBar** | One row: context-sensitive `key label` hints (or the `/ ` filter, `note:`, and `o` flag prompts; or active `/filter` · `fail-only` · `sort:` flags) on the left, and `▶ model  Σ cost` on the right. |
| **Bars** | `bar(frac, color, width)` — a `▓`/`░` proportional fill used for pass-rate and context-window usage. |
| **Diff renderer** | LCS line diff of `without_skill` → `with_skill` responses, with `+`/`-` gutters and add/remove wash colors. |
| **Badges** | Status glyphs (`✓ ✗ ◐ ◌`) + `passed/total` fractions, colored by pass rate and delta. |
| **RunConsole** | Overlay shown while `r`/`R` run evals in-process (Ink stays mounted): spinner header, elapsed timer, per-case pass bars, and a run summary. |
| **NewCaseForm** | Overlay for `n` — three fields (id · prompt · expected) that append a skeleton case to `evals.json`. |

## Themes

Select with `ARC_TUI_THEME=tokyonight|gruvbox|nord` (default `tokyonight`). Below 256-color terminals, the hex palette falls back to named 16-color ANSI.

| Token | tokyonight | gruvbox | nord |
| --- | --- | --- | --- |
| Background (`bg`) | `#1a1b26` | `#282828` | `#2e3440` |
| Text (`fg`) | `#c0caf5` | `#ebdbb2` | `#d8dee9` |
| Accent / focus (`blue`) | `#7aa2f7` | `#83a598` | `#81a1c1` |
| Pass (`green`) | `#9ece6a` | `#b8bb26` | `#a3be8c` |
| Fail (`red`) | `#f7768e` | `#fb4934` | `#bf616a` |
| Partial (`orange`) | `#ff9e64` | `#fe8019` | `#d08770` |
| Keys / prompt (`yellow`) | `#e0af68` | `#fabd2f` | `#ebcb8b` |
| Focused border (`borderActive`) | `#7aa2f7` | `#fabd2f` | `#88c0d0` |

The full 18-token set, the unicode/ASCII glyph tables, and component anatomy are documented in [`STYLE.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/src/tui/STYLE.md).

## Glyphs

Unicode on UTF-8 locales; ASCII fallback otherwise (or with `ARC_TUI_ASCII=1`):

| Status | Bars | Cursor | Nav |
| --- | --- | --- | --- |
| `✓ ✗ ◐ ◌` → `+ x ~ .` | `▓ ░` → `# -` | `▌` → `\|` | `↑ ↓ → ←` → `^ v -> <-` |

## See also

- [Browse (TUI)](/arc-skill-eval/browse/) — the interactive run browser these components render
- [`STYLE.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/src/tui/STYLE.md) — token source of truth
