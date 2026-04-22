---
name: hello-world
description: Deterministic reference skill used as a permanent smoke test for arc-skill-eval. When asked to create a greeting, writes `greeting.txt` with a single line `Hello, <name>!` and replies with a confirmation that names the file. Not intended for production use — it exists so the framework has a stable, cheap, predictable target to exercise every pipeline stage.
---

# hello-world

Minimal skill used by `arc-skill-eval` as a permanent reference example + smoke test. The goal is not to be useful — the goal is to be *easy to assert about*.

## What this skill does

When invoked, follow these steps exactly:

1. Read the prompt and extract the intended greeter name.
   - If the prompt names a specific recipient ("a greeting for Ada", "greet Grace"), use that name verbatim.
   - If the prompt is generic ("create a greeting"), use `world`.
2. Use the **Write** tool to create a file called **`greeting.txt`** in the workspace root. The file content is exactly one line: `Hello, <name>!` (note the comma, the space after it, and the trailing exclamation mark).
3. Reply with a **single sentence** that confirms the file was written and mentions the filename `greeting.txt` explicitly.

## Rules

- Always write to `greeting.txt` at the workspace root. Never a subdirectory.
- The file body is exactly `Hello, <name>!` on one line. No extra text, no trailing fluff.
- The confirmation message must contain the exact string `greeting.txt`.
- Do not create additional files.
- Do not run shell commands.
- Do not explain, elaborate, or summarize further.

## Why it exists

This skill is the smoke test for `arc-skill-eval`. If its evals pass, the framework's whole pipeline — discovery, runner, grader, workspace capture, script assertions, LLM-judged assertions — is healthy. Authors of real skills can treat the companion `evals/evals.json` as a worked example of the format.
