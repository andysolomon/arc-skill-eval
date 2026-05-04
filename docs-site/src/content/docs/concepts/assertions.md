---
title: Assertions
description: The discriminated union of assertion types — LLM-judged strings, deterministic scripts, and intent assertions.
sidebar:
  order: 3
---

Assertions are the load-bearing part of an eval case. Each assertion is graded independently and contributes one row to the case's `grading.json`. The framework supports three families, picked per assertion based on what you're trying to check.

```ts
type EvalAssertion =
  | string                                                              // legacy LLM-judged
  | { type: "file-exists" | "regex-match" | "json-valid"; ...args }    // legacy script
  | { id: string; kind: "output" | "workspace" | "behavior" | "safety"; method: ...; ... }; // intent
```

## LLM-judged string assertions

A bare string is graded by the LLM-judge. This is the format Anthropic's published spec uses, and it's the right choice for prose claims.

```json
"The response summarizes the semantic-release plugins it installed."
```

The judge produces `{ passed, evidence }` per assertion. The `evidence` field cites a passage from the assistant text or a workspace file — that's the proof the assertion actually held, not just the verdict.

**When to use:** for claims about prose properties, summaries, intent, tone, structure of natural-language output. Anything a script can't reliably detect.

**When not to use:** for mechanical facts (file presence, exact regex, JSON validity). A script is faster, cheaper, and not subject to paraphrase.

## Deterministic script assertions

Three legacy script types are built in. They're synchronous and don't make any LLM calls.

### `file-exists`

```json
{ "type": "file-exists", "path": ".releaserc.json" }
```

Path is relative to the workspace root, with a path-traversal guard. Evidence reports the resolved path and the file size.

### `regex-match`

```json
{ "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } }
```

Target is either `{ "file": "<relative-path>" }` or the string `"assistant-text"`. The pattern is a JavaScript regex string (escape backslashes accordingly).

### `json-valid`

```json
{ "type": "json-valid", "path": ".releaserc.json" }
```

True if the file parses as JSON. Evidence reports either a parsed type summary or the parse error.

## Intent assertions

A newer, structured shape with explicit `id`, `kind`, and `method` fields. They split assertions by the entity they target:

- **`kind: "output"`** with `method: "judge" | "regex" | "exact"` — assertions about the assistant's reply.
- **`kind: "workspace"`** with `method: "file-exists" | "file-contains" | "json-valid" | "snapshot-diff"` — assertions about the workspace state after the run.
- **`kind: "behavior"`** and **`kind: "safety"`** — trace-aware checks. They validate as input today; deterministic grading for them is deferred.

Intent assertions are richer than the legacy shapes — they carry a stable id (good for diffing across runs) and an explicit kind that maps cleanly onto the artifact the grader needs to read.

## How the grader fits these together

The grader (`src/evals/grade.ts`) batches all LLM-judged work into a single judge call where it can — string assertions and any `kind: "output"` with `method: "judge"` go in one batch — while script-type assertions run synchronously. That keeps the cost of a case proportional to the prose claims, not the total assertion count.

A path-traversal guard runs on every workspace path before any file read, so a malformed assertion can't escape the temp workspace.

## Authoring guidelines

- **Script assertions first.** They're cheap, deterministic, and fail honestly. Only reach for the judge when you need to assert about prose.
- **Budget 2–5 assertions per case.** More than that and one will start failing for the wrong reasons.
- **Avoid literal-quote assertions.** *"The response says 'Hello, world!'"* will pass on paraphrase. Assert on the effect (a regex on the produced file) instead.
- **Don't copy the skill's instructions verbatim into assertions.** If `SKILL.md` says "the .releaserc.json must use the conventionalcommits preset," asserting that exact text won't distinguish skill output from regurgitation.
- **Prefer action verbs and proper nouns.** *"The response names the conventionalcommits preset"* is checkable. *"You should explain it"* is not.
