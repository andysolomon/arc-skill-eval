---
title: Browse (TUI)
description: An interactive terminal run browser over evals-runs/ artifacts — panels for skills, cases, assertions, and runs, with re-run and compare views.
---

`arc-skill-eval browse` opens an interactive terminal UI (built with [Ink](https://github.com/vadimdemedes/ink)) over the artifacts under `evals-runs/`. It is a read-and-act view of everything `run` writes: grading, timing, tool usage, and the `with_skill` vs `without_skill` comparison — without grepping JSON.

```bash
# the current directory (a skill dir or a repo root)
arc-skill-eval browse

# one skill
arc-skill-eval browse ./skills/arc-conventional-commits

# a repo root (discovers every SKILL.md + evals/evals.json pair)
arc-skill-eval browse .
```

If `<input>` is a skill directory (contains `evals/evals.json`) it loads that skill's newest run; if it's a repo root it discovers skills and lists them. With no artifacts yet, it tells you to `run` first.

## Layout

A left rail of four stacked panels drives a detail pane on the right. The detail pane re-projects based on which panel is focused.

| Panel | Contents |
| --- | --- |
| **[1] Skills** | Discovered skills with pass fraction and with-skill delta |
| **[2] Cases** | Eval cases for the selected skill, with pass/fail status |
| **[3] Assertions** | Assertions for the selected case — deterministic (`file-exists`, `regex-match`, `json-valid`) vs LLM-judge |
| **[4] Runs** | Run / iteration history with the compare marker and exit code |

The detail pane shows: for a **case** — see the tabbed detail modes below; for an **assertion** — its claim, evidence, and raw `evals.json` source; for a **run** — the reconstructed `arc-skill-eval run …` command, exit code, and output paths.

### Case detail modes

When a case is selected, the detail pane is tabbed. Cycle the tabs with `[` / `]` (the strip shows in the pane header); `v` jumps straight to **Raw**.

| Mode | Contents |
| --- | --- |
| **Overview** | Prompt, expected output, per-assertion grading with evidence, metrics (model, duration, tokens, cost, context-usage bar), and the with/without summary |
| **Response** | The final assistant response (`assistant.md`) |
| **Diff** *(compare runs only)* | A line diff of the `without_skill` → `with_skill` responses — the load-bearing signal, made visible |
| **Trace** | Tool-call digest from `tool-summary.json` (calls by name, bash/file/skill activity, external calls) plus the produced `outputs/` listing |
| **Context** | The `context-manifest.json` — attached skills colored by role (`target`/`extra`/`ambient`), active/available tools, MCP tools, and ambient flags |
| **Raw** | The raw `grading.json` |

## Keybindings

| Key | Action |
| --- | --- |
| `↑ ↓` / `j k` | Move selection in the focused panel |
| `Tab` / `⇧Tab` | Focus next / previous panel |
| `1`–`4` | Jump to Skills / Cases / Assertions / Runs |
| `→` / `l` / `↵` | Enter the detail-pane cursor |
| `↵` *(in pane)* | Drill the cursor item into its side panel |
| `←` / `h` / `Esc` | Leave the detail-pane cursor |
| `[` / `]` | Cycle the case detail mode (Overview / Response / Diff / Trace / Context / Raw) |
| `v` | Jump to raw `grading.json` (Cases) |
| `PgUp`/`PgDn` · `⌃u`/`⌃d` | Scroll the detail pane |
| `r` | Re-run evals for the selected skill (or case), then reload |
| `R` | Re-run the selected skill with `--compare` (with/without baseline) |
| `/` | Filter skills / cases by name (type to filter, `↵` accept, `Esc` clear) |
| `F` | Toggle failures-only |
| `s` | Cycle skill sort (name / pass / delta / cost) |
| `f` | Write a `feedback.json` note for the selected case |
| `c` | Pin the selected run as the cross-iteration baseline (Runs panel) |
| `g` / `G` | Top / bottom |
| `?` | Help overlay |
| `q` / `Ctrl-C` | Quit |

### Filtering and sorting

`/` opens a name filter over the Skills and Cases panels — type to narrow, `↵` to keep it, `Esc` to clear. `F` toggles a failures-only view (skills/cases that aren't fully passing). `s` cycles the Skills sort between name, pass rate, with-skill delta, and cost. Active filters show in the status bar.

### Writing feedback (`f`)

With a case selected, `f` opens a note prompt. On `↵` it writes (or merges into) a `feedback.json` in the skill's newest run directory, setting that case's `status` to `reviewed` and storing your text in `notes`. The file matches the schema `arc-skill-eval improve --from-feedback` consumes, so the browse → note → improve loop stays in one place.

### Detail-pane cursor

The detail pane free-scrolls by default. Press `→` / `l` / `↵` to drop a cursor into it; `j`/`k` move the cursor and the scroll follows it. On the Skills/Cases views the cursor lands on items (cases / assertions) and `↵` drills into the matching side panel; on the Assertions/Runs views it steps through section headers. `←` / `h` / `Esc` returns to free-scroll.

### Re-running (`r`, `R`)

`r` runs `arc-skill-eval run <skillDir> [--case <id>]` with live output, then reloads only that skill's artifacts and drops you back exactly where you were. On the Skills panel it runs the whole skill; on the Cases panel it adds `--case`. `R` runs the same skill with `--compare`, so the next view has fresh with/without-skill numbers. The `arc-skill-eval` binary must be on `PATH` (override with `ARC_SKILL_EVAL_BIN`).

### Cross-iteration comparison (`c`)

On the Runs panel, `c` pins the selected run as a baseline. The Runs view then shows each other run's pass-rate and cost movement relative to the pinned run — a quick way to see whether an iteration actually moved the needle.

## Flags

### `--no-baseline`

Hide the `without_skill` comparison rows in the detail pane (handy when you only care about the with-skill result):

```bash
arc-skill-eval browse ./skills/arc-conventional-commits --no-baseline
```

## Terminal compatibility

Colors and glyphs adapt to the terminal at startup:

- **Color** — truecolor uses the full Tokyo Night palette; 256-color is auto-downsampled; 16-color terminals get a named-ANSI fallback. `NO_COLOR` or `FORCE_COLOR=0` disables color.
- **Glyphs** — block bars, status ticks, and arrows use unicode on UTF-8 locales and fall back to ASCII otherwise. Force ASCII with `ARC_TUI_ASCII=1`.
- **Theme** — `ARC_TUI_THEME=tokyonight|gruvbox|nord` selects the palette (default `tokyonight`).

```bash
# force a plain, ASCII, no-color render
NO_COLOR=1 ARC_TUI_ASCII=1 arc-skill-eval browse .

# Gruvbox palette
ARC_TUI_THEME=gruvbox arc-skill-eval browse .
```

## See also

- [CLI reference](/arc-skill-eval/cli-reference/) — the non-interactive commands
- [Artifacts](/arc-skill-eval/concepts/artifacts/) — what `browse` reads from `evals-runs/`
- [Dogfooding & Authoring Loop](/arc-skill-eval/dogfooding/) — interpreting the with/without delta
