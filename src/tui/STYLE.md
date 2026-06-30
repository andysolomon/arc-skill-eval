# TUI style & component spec

The design tokens and component anatomy for the `arc-skill-eval browse` Ink TUI.

- **Visual reference:** the *TUI Component Gallery* (a DC export), mirrored as a static asset at `docs-site/public/component-gallery.html` and documented at [`docs-site/src/content/docs/components.md`](../../docs-site/src/content/docs/components.md).
- **Implementation:** palettes and helpers in [`theme.ts`](./theme.ts); capability detection and glyphs in [`caps.ts`](./caps.ts).
- **Guard:** [`tests/tui-components.test.mjs`](../../tests/tui-components.test.mjs) pins these tokens so code, spec, and gallery don't drift.

When a token here changes, change it in `theme.ts`/`caps.ts`, update the gallery, and update the pinned values in the conformance test — all three in one commit.

## Palettes

Selected at startup via `ARC_TUI_THEME=tokyonight|gruvbox|nord` (default `tokyonight`). On terminals below 256-color the hex palette is replaced by a named 16-color ANSI fallback (see `ANSI` in `theme.ts`).

| Token | tokyonight | gruvbox | nord | Role |
| --- | --- | --- | --- | --- |
| `bg` | `#1a1b26` | `#282828` | `#2e3440` | App background |
| `bgDark` | `#16161e` | `#1d2021` | `#272c36` | Recessed background |
| `bgHi` | `#222538` | `#3c3836` | `#3b4252` | Unfocused selection background |
| `fg` | `#c0caf5` | `#ebdbb2` | `#d8dee9` | Primary text |
| `fgDark` | `#a9b1d6` | `#d5c4a1` | `#e5e9f0` | Secondary text |
| `comment` | `#565f89` | `#928374` | `#4c566a` | Muted / hints |
| `blue` | `#7aa2f7` | `#83a598` | `#81a1c1` | Accent / focus / titles |
| `cyan` | `#7dcfff` | `#8ec07c` | `#88c0d0` | Active filter |
| `green` | `#9ece6a` | `#b8bb26` | `#a3be8c` | Pass / cost / positive delta |
| `magenta` | `#bb9af7` | `#d3869b` | `#b48ead` | Sort indicator |
| `red` | `#f7768e` | `#fb4934` | `#bf616a` | Fail / failures-only |
| `orange` | `#ff9e64` | `#fe8019` | `#d08770` | Partial / mid pass-rate |
| `yellow` | `#e0af68` | `#fabd2f` | `#ebcb8b` | Keys / prompts |
| `teal` | `#73daca` | `#8ec07c` | `#8fbcbb` | Accent |
| `selection` | `#283457` | `#504945` | `#434c5e` | Focused selection background |
| `border` | `#2a2e42` | `#3c3836` | `#3b4252` | Panel border (unfocused) |
| `borderActive` | `#7aa2f7` | `#fabd2f` | `#88c0d0` | Panel border (focused) |
| `dim` | `#3b4261` | `#665c54` | `#4c566a` | Empty bar cells / chrome |

## Glyphs

Unicode on UTF-8 locales; ASCII fallback otherwise (or with `ARC_TUI_ASCII=1`). Both sets are key-complete — see `GLYPH_SETS` in `caps.ts`.

| Key | Unicode | ASCII | Use |
| --- | --- | --- | --- |
| `pass` / `fail` / `partial` / `running` | `✓` `✗` `◐` `◌` | `+` `x` `~` `.` | Case / assertion status |
| `barFull` / `barEmpty` | `▓` `░` | `#` `-` | Pass-rate / context bars |
| `accent` | `▌` | `\|` | Selection / filter cursor |
| `up` / `down` / `arrowR` / `arrowL` | `↑` `↓` `→` `←` | `^` `v` `->` `<-` | Navigation hints |
| `enter` / `shift` / `ctrl` | `↵` `⇧` `⌃` | `ent` `shift+` `^` | Key labels |
| `play` / `sigma` / `compare` / `delta` / `bullet` | `▶` `Σ` `⇄` `Δ` `●` | `>` `sum` `<>` `d` `*` | Status bar / run markers |
| `spinner` (`string[]`) | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` (braille frames) | `\| / - \\` | Run-console activity animation |

## Components

- **Panel** — rounded-border box with a `[n] Name` title (bold blue when focused, `borderActive`) and a count/position badge. Holds a `RowList`.
- **RowList** — selectable rows; the focused selection gets a `selection` background + an `accent` bar; windows with `up`/`down` overflow markers when taller than its slot.
- **MainPane** — the right-hand detail pane: a title + sub-segment header, free-scrolling body, and an in-pane cursor (`selection` background) for drill-in.
- **StatusBar** — single row: context-sensitive `key label` hints on the left (or the `/ ` filter / `note:` / `o` flag prompt when capturing input, or active `/filter` · `fail-only` · `sort:` flags), and `▶ model  Σ cost` on the right.
- **Bars** — `bar(frac, color, width)` renders a `barFull`/`barEmpty` run; used for pass-rate and context-window usage.
- **Diff renderer** — LCS line diff of `without_skill` → `with_skill` responses, with `+`/`-` gutters and add/remove wash colors (green/red).
- **Badges** — status glyphs + `passed/total` fractions, colored by `rateColor` / `deltaColor`.
- **RunConsole** — overlay shown while `r`/`R` run evals in-process (Ink never unmounts): a `spinner` header, an elapsed timer, per-case rows that fill a pass bar, and a `running → ✓ run complete` summary.
- **NewCaseForm** — overlay for `n`: three fields (id · prompt · expected) that append a skeleton case to `evals.json`.

## Spacing

Single-column rounded panels in a left rail (`Skills`/`Cases`/`Assertions`/`Runs`) sized by weighted `flexGrow`; the detail pane fills the remainder. One-cell horizontal padding inside panels; the status bar is a fixed single row.
