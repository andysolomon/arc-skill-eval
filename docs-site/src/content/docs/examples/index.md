---
title: Examples
description: Worked examples of skills with eval suites — the hello-world reference skill, with more skills to follow.
sidebar:
  order: 0
audio: false
---

This section is for fully-worked examples — skills you can read end-to-end, run on your machine, and use as authoring templates.

## Available now

- **[hello-world](/arc-skill-eval/examples/hello-world/)** — the deterministic reference skill that ships with `arc-skill-eval`. Three cases. Mixes `file-exists`, `regex-match` (against both files and the assistant's reply), and an LLM-judged assertion. Takes ~30 seconds end-to-end.

## Coming soon

More worked examples — including skills with fixtures, conflict-mode runs, and `--compare` baselines that show meaningful pass-rate deltas — will land here as I run the framework on real skills. If you've authored a skill with `evals/evals.json` and want it featured, [open an issue](https://github.com/andysolomon/arc-skill-eval/issues).
