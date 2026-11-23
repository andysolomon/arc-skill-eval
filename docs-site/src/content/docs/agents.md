---
title: Use it from an agent
description: Install the bundled agent skills so Claude Code, Codex, Cursor Agent, Copilot, or Pi can write and run skill evals through the arc-skill-eval CLI.
---

A coding agent can drive `arc-skill-eval` from its shell tool. The package ships skills that tell the agent which commands to run and how to read the results. Every command except `browse` prints one JSON object with `--json`, so the agent never has to parse terminal text.

## Install the skills

Install the CLI, then copy the agent skills into your project:

```bash
npm install --global arc-skill-eval
cd my-project
arc-skill-eval install-skills
```

By default, `install-skills` copies `arc-creating-evals` and `arc-running-evals` into `.agents/skills/` and `.claude/skills/` in the current directory. Those two folders cover every supported agent:

| Agent | `--harness` | Folders |
| --- | --- | --- |
| Claude Code | `claude-code` | `.claude/skills` |
| Codex | `codex` | `.agents/skills` |
| Copilot CLI | `copilot` | `.agents/skills` |
| Pi | `pi` | `.agents/skills` |
| Cursor Agent | `cursor-agent` | `.agents/skills`, `.cursor/skills` |

Pass `--harness` one or more times to install only the folders you need. Pass `--target <dir>` to install into another project. The command skips a skill folder that already exists. Pass `--force` to replace it.

```bash
arc-skill-eval install-skills --harness claude-code
arc-skill-eval install-skills --target ../my-project --force
```

Restart or reload the agent afterwards so it loads the new skills. The installed copies leave out each skill's `evals/` folder, because an agent that scans folders would load those fixture `SKILL.md` files as real skills.

## The bundled skills

### `arc-creating-evals`

This skill writes an eval suite for an existing skill. Ask the agent something like "write evals for this skill" or "make this skill testable". The agent reads the target `SKILL.md`, agrees on what success looks like with you, drafts cases and assertions, and writes `evals/evals.json` plus any fixtures under `evals/files/`. It stops for your confirmation between phases.

`create --guided` uses the same skill, so the CLI and the agent design cases the same way. See [Authoring evals](/arc-skill-eval/authoring-evals/).

### `arc-running-evals`

This skill runs an existing suite and explains the result. Ask "run the evals", "why did eval 3 fail", or "compare with and without the skill". The agent:

1. runs `arc-skill-eval run <skill-dir> --json` and parses stdout as one JSON object,
2. checks for an `error` key first, so a bad command line is never reported as a failed eval,
3. explains each failure as a skill bug, an eval bug, or an environment problem,
4. with your approval, runs `review` and `improve --from-feedback`, then re-runs only the failing cases.

It asks before a full-suite run, a `--compare` run, or a run that starts another agent CLI, because each of those calls models and costs money.

### `arc-evals-lite` (opt-in)

This skill writes and runs evals without the CLI. The agent you already use does the work, and the suites use the same `evals/evals.json` format, so they run unchanged under the CLI later.

Lite has limits. It runs each case in a fresh sub-agent or a headless agent CLI, and it refuses to run in an agent that can't start one, rather than grade its own answers. It checks `file-exists`, `file-absent`, `json-valid`, `regex-match`, and judge assertions. It skips tool-call checks, sandboxing, timing, cost, and CI exit codes, and records those as needing the CLI.

`install-skills` leaves lite out by default, because next to the CLI-backed skills it would also answer "run the evals". Add it explicitly:

```bash
arc-skill-eval install-skills --skill arc-evals-lite
```

Lite is a single `SKILL.md` file, so you can also copy it into a project that doesn't have the CLI. [`skills/README.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/skills/README.md) shows how.

## What the agent relies on

The skills depend on the JSON contract:

- With `--json`, stdout holds exactly one JSON object. Progress and warnings go to stderr.
- Every object has `"schemaVersion": 1`.
- A command that can't finish prints `{"schemaVersion":1,"error":{"kind":"...","message":"..."}}` and exits `1`.
- Exit code `1` without an `error` object is a verdict: a case or assertion failed.

`browse` and `create --interactive` need a terminal and refuse to start without one. An agent should use `run --json` and `create --dry-run --json` instead. [JSON output](/arc-skill-eval/json-output/) lists every payload and exit code.

## Paths to bundled skills

`bundled` prints where the package installed its skills. Use it to run the reference suite or to copy a skill by hand:

```bash
arc-skill-eval bundled
arc-skill-eval run "$(arc-skill-eval bundled hello-world)" --json
```
