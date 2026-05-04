---
title: Concepts
description: The runtime entities Skeval operates on — skills, eval cases, assertions, the with/without skill comparison, grading, and run artifacts.
sidebar:
  order: 0
audio: false
---

This section is the architectural map of `arc-skill-eval`. Each sub-page covers one runtime entity and how it shows up in the artifacts a run produces. Read them in order if you're new; jump straight to the one you need if you're not.

| Page | What it covers |
|---|---|
| [Skills](/arc-skill-eval/concepts/skills/) | What counts as a skill, how Skeval discovers them, and the domain types that classify capabilities and policy. |
| [Eval cases](/arc-skill-eval/concepts/eval-cases/) | The shape of an `EvalCase` and the workspace setup options (`empty`, `seeded`, `fixture`) that prepare a case to run. |
| [Assertions](/arc-skill-eval/concepts/assertions/) | The discriminated union of LLM-judged strings, legacy script assertions, and intent assertions. |
| [With/without skill](/arc-skill-eval/concepts/with-without-skill/) | The dual-run comparison and why the pass-rate delta is the canonical signal. |
| [Grading](/arc-skill-eval/concepts/grading/) | How the LLM-judge and deterministic scripts coexist, batched into one judge call where possible. |
| [Artifacts](/arc-skill-eval/concepts/artifacts/) | The per-case output tree (`assistant.md`, `outputs/`, `grading.json`, `timing.json`, `trace.json`, `tool-summary.json`, `context-manifest.json`) and the run-level `benchmark.json`. |

The full pipeline — discover → load → materialize → run → grade → write — is summarized at the bottom of the [Skills](/arc-skill-eval/concepts/skills/) page.
