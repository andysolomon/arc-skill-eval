---
title: Components and themes
description: Browse TUI components and the tokyonight, gruvbox, and nord themes.
---

The `browse` TUI uses shared components, color tokens, and glyphs. Use the gallery for a visual reference. [`src/tui/STYLE.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/src/tui/STYLE.md) defines the tokens implemented by `theme.ts` and `caps.ts` and checked by `tests/tui-components.test.mjs`.

## Interactive gallery

[Open the TUI component gallery](/arc-skill-eval/component-gallery.html) to view each component in all three themes.

> The gallery is a generated DC export. `STYLE.md` and the conformance test define the implemented tokens.

## Components

| Component | What it is |
| --- | --- |
| **Panel** | A rounded box with a `[n] Name` title, count or position badge, and row list. Focus applies `borderActive` and blue title text. |
| **RowList** | Selectable rows with a `selection` background, an `accent` bar, and `↑` or `↓` overflow markers. |
| **MainPane** | The right-hand detail pane with a title, subheader, scrolling body, and cursor. |
| **StatusBar** | Context-sensitive key hints, prompts, and filter state on the left; model and cost on the right. |
| **Bars** | `bar(frac, color, width)` renders a proportional `▓` and `░` bar for pass rate and context-window use. |
| **Diff renderer** | An LCS line diff from `without_skill` to `with_skill`, with `+` and `-` gutters and background colors. |
| **Badges** | Status glyphs (`✓ ✗ ◐ ◌`) and `passed/total` fractions colored by pass rate and delta. |
| **RunConsole** | An overlay with a spinner, elapsed time, per-case pass bars, and run summary while `r` or `R` runs evals. |
| **NewCaseForm** | An overlay for entering an ID, prompt, and expected result before appending a case skeleton to `evals.json`. |

## Themes

Set `ARC_TUI_THEME=tokyonight|gruvbox|nord`. The default is `tokyonight`. Terminals with fewer than 256 colors use named ANSI values.

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

UTF-8 locales use Unicode. Other locales use ASCII. Set `ARC_TUI_ASCII=1` to force ASCII.

| Status | Bars | Cursor | Nav |
| --- | --- | --- | --- |
| `✓ ✗ ◐ ◌` → `+ x ~ .` | `▓ ░` → `# -` | `▌` → `\|` | `↑ ↓ → ←` → `^ v -> <-` |

## See also

- [Browse (TUI)](/arc-skill-eval/browse/) explains the interactive run browser.
- [`STYLE.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/src/tui/STYLE.md) defines the tokens.
