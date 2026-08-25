---
title: Browse (TUI)
description: An interactive terminal run browser over evals-runs/ artifacts — panels for skills, cases, assertions, and runs, with re-run and compare views.
---

`arc-skill-eval browse` opens an interactive terminal UI built with [Ink](https://github.com/vadimdemedes/ink). It reads grading, timing, tool-use, and comparison data from `evals-runs/`.

```bash
# the current directory (a skill dir or a repo root)
arc-skill-eval browse

# one skill
arc-skill-eval browse ./skills/arc-conventional-commits

# a repo root (discovers every SKILL.md + evals/evals.json pair)
arc-skill-eval browse .
```

If `<input>` contains `evals/evals.json`, the browser loads that skill's newest run. If `<input>` is a repository root, it lists discovered skills. When no run artifacts exist, it prompts you to run the suite first.

## Layout

Four panels on the left control the detail pane on the right.

| Panel | Contents |
| --- | --- |
| **[1] Skills** | Discovered skills with pass fraction and with-skill delta. Skills loaded only through `--extra-skill` appear dimmed with a `distractor` badge. |
| **[2] Cases** | Eval cases for the selected skill, with pass/fail status |
| **[3] Assertions** | Deterministic and judged assertions for the selected case |
| **[4] Runs** | Run / iteration history with the compare marker and exit code |

For a case, the detail pane shows the tabs below. For an assertion, it shows the claim, evidence, and source from `evals.json`. For a run, it shows the reconstructed command, exit code, and output paths.

### Case detail modes

When a case is selected, the detail pane is tabbed. Cycle the tabs with `[` / `]` (the strip shows in the pane header); `v` jumps straight to **Raw**.

| Mode | Contents |
| --- | --- |
| **Overview** | Prompt, expected output, per-assertion grading with evidence, metrics (model, duration, tokens, cost, context-usage bar), and the with/without summary |
| **Response** | The final assistant response (`assistant.md`) |
| **Diff** *(compare runs only)* | A line diff from the `without_skill` response to the `with_skill` response |
| **Trace** | Tool-call digest from `tool-summary.json` (calls by name, bash/file/skill activity, external calls) plus the produced `outputs/` listing |
| **Context** | The `context-manifest.json` — attached skills colored by role (`target`/`extra`/`ambient`), active/available tools, MCP tools, and ambient flags |
| **Raw** | The raw `grading.json` |

## Keybindings

The [Keybindings reference](/arc-skill-eval/keymap/) is generated from [`src/tui/keymap.ts`](https://github.com/andysolomon/arc-skill-eval/blob/main/src/tui/keymap.ts) by `scripts/gen-keymap-docs.mjs`. The `?` overlay uses the same source. The sections below explain multi-step actions.

### Filtering and sorting

Press `/` to filter Skills and Cases by name. Press `↵` to keep the filter or `Esc` to clear it. `F` toggles a failures-only view. `s` sorts Skills by name, pass rate, with-skill delta, or cost. Active filters appear in the status bar.

### Writing feedback (`f`)

With a case selected, press `f` to enter a note. Press `↵` to write or merge the note into `feedback.json` in the newest run directory. The browser sets the case status to `reviewed` and stores the text in `notes`. `arc-skill-eval improve --from-feedback` reads the same file.

### Detail-pane cursor

The detail pane scrolls freely by default. Press `→`, `l`, or `↵` to place a cursor in it. Use `j` and `k` to move. In the Skills and Cases views, `↵` opens the selected case or assertion in its side panel. In the Assertions and Runs views, the cursor moves through section headers. Press `←`, `h`, or `Esc` to return to free scrolling.

### Re-running (`r`, `R`, `o`)

Press `r` to run the selected skill or case in the TUI. A console overlays the browser with a spinner, elapsed time, and per-case pass bars. When the run finishes, press `↵` to reload the artifacts or `Esc` to abort. In the Skills panel, `r` runs the whole skill. In the Cases panel, it runs only that case. `R` adds `--compare`.

Press `o` to enter custom `run` flags such as `--model`, `--iteration`, `--extra-skill`, or `--context-mode ambient`. The prompt starts with `--model ` in Cases and `--iteration ` in Runs. Press `↵` to run the command and reload, or `Esc` to cancel. This action starts a subprocess, so `arc-skill-eval` must be on `PATH`. Set `ARC_SKILL_EVAL_BIN` to use another binary path.

### New eval case (`n`)

In the Skills or Cases panel, press `n` to enter an ID, prompt, and expected result. Saving appends a valid case skeleton with a placeholder `file-exists` assertion to `evals/evals.json`. Edit the file to replace the placeholder.

### Cross-iteration comparison (`c`)

In the Runs panel, press `c` to pin the selected run as a baseline. The Runs view then shows pass-rate and cost changes relative to that run.

## Flags

### `--no-baseline`

Hide the `without_skill` comparison rows in the detail pane (handy when you only care about the with-skill result):

```bash
arc-skill-eval browse ./skills/arc-conventional-commits --no-baseline
```

## Terminal compatibility

Colors and glyphs adapt to the terminal:

- Truecolor terminals use the Tokyo Night palette. Lower-color terminals use 256-color or named ANSI values. Set `NO_COLOR` or `FORCE_COLOR=0` to disable color.
- UTF-8 locales use block bars, status marks, and arrows. Other locales use ASCII. Set `ARC_TUI_ASCII=1` to force ASCII.
- Set `ARC_TUI_THEME=tokyonight|gruvbox|nord` to choose a palette. The default is `tokyonight`.

```bash
# force a plain, ASCII, no-color render
NO_COLOR=1 ARC_TUI_ASCII=1 arc-skill-eval browse .

# Gruvbox palette
ARC_TUI_THEME=gruvbox arc-skill-eval browse .
```

## See also

- [CLI reference](/arc-skill-eval/cli-reference/) for non-interactive commands
- [Artifacts](/arc-skill-eval/concepts/artifacts/) for the files under `evals-runs/`
- [Dogfooding and authoring loop](/arc-skill-eval/dogfooding/) for interpreting the with/without delta
