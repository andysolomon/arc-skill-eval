---
title: Eval cases
description: The shape of an EvalCase and the workspace-setup options that prepare a case to run.
sidebar:
  order: 2
---

An **eval case** is one row in `evals/evals.json` — one prompt the model is given, one expected behavior, and a small set of assertions that decide whether the run was a pass.

## The case shape

```ts
type EvalCase = {
  id: string | number;
  description?: string;
  prompt: string;
  expected_output?: string;
  setup?: WorkspaceSetup;
  files?: string[];           // legacy shorthand for setup
  assertions?: EvalAssertion[];
  metadata?: Record<string, unknown>;
};
```

Loaded and validated by `readEvalsJson` (in `src/evals/loader.ts`) with an issue-collecting error type — invalid cases produce a structured list of issues rather than a single thrown error, so the CLI can report all problems in one pass.

A few notes on the fields:

- **`id`** — string or number. Lowercase kebab-case slugs are recommended (`default-world`, `assistant-names-file`). Numbers also work. The CLI sanitizes IDs for filesystem paths under `eval-<id>/`, but readable IDs make the artifact tree self-documenting.
- **`prompt`** — exactly what you'd type into your agent. One realistic user message per case.
- **`expected_output`** — a human-readable description of success. Not used directly by the grader; it's a comment for the author and for whoever reads the suite later.
- **`assertions`** — see [Assertions](/arc-skill-eval/concepts/assertions/) for the union of types.

## Workspace setup

`WorkspaceSetup` unifies the ways a case prepares its execution workspace:

```ts
type WorkspaceSetup =
  | { kind: "empty" }
  | { kind: "seeded"; sources: string[]; mountMode?: "preserve-path" | "flatten" }
  | { kind: "fixture"; fixture: FixtureRef };
```

- **`empty`** — start with an empty temp workspace. Best for skills that produce files from scratch.
- **`seeded`** — copy files from `evals/` into the temp workspace before the run. `sources` is a list of paths inside `evals/`; `mountMode` is either `"preserve-path"` (default — preserves source paths) or `"flatten"` (puts every source's contents at workspace root).
- **`fixture`** — use the existing `FixtureRef` materializer (in `src/fixtures/`), which supports git initialization and pre-run hooks. Use this when a case needs to start from a non-trivial repo state.

The legacy `files: ["..."]` shorthand still works and compiles to a `seeded` setup with `mountMode: "preserve-path"`. Prefer `setup` for new cases — it's explicit about intent and supports all three kinds.

## Concrete examples

**Empty workspace, single assertion:**

```json
{
  "id": "default-world",
  "prompt": "Create a greeting.",
  "expected_output": "greeting.txt with 'Hello, world!'",
  "assertions": [
    { "type": "file-exists", "path": "greeting.txt" }
  ]
}
```

**Seeded with a fixture directory:**

```json
{
  "id": 1,
  "prompt": "Set up semantic-release in this repo.",
  "files": ["files/clean-repo"],
  "assertions": [
    { "type": "file-exists", "path": ".releaserc.json" },
    { "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } },
    "The response summarizes the semantic-release plugins it installed."
  ]
}
```

**Mixed targets (file + assistant text):**

```json
{
  "id": "assistant-names-file",
  "prompt": "Please generate a greeting for Grace Hopper.",
  "assertions": [
    { "type": "file-exists", "path": "greeting.txt" },
    { "type": "regex-match", "pattern": "greeting\\.txt", "target": "assistant-text" },
    { "type": "regex-match", "pattern": "Hello, Grace Hopper!", "target": { "file": "greeting.txt" } }
  ]
}
```

The third case asserts both on a file *and* on the assistant's reply — the regex `target` can be a workspace file or the literal string `"assistant-text"`.

## Running one case in isolation

The CLI takes `--case <id>` and is repeatable, so you can run a single case end-to-end without touching the others:

```bash
arc-skill-eval run ./skills/hello-world --case default-world
```

That's the right loop while iterating on a single assertion or a single fixture — you avoid the wall-clock cost of the rest of the suite until you've stabilized the one case.
