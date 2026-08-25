---
title: Assertions
description: Choose among judged strings, deterministic scripts, and structured intent assertions.
sidebar:
  order: 3
---

Assertions define what each case checks. Skeval grades them independently and writes one result per assertion to `grading.json`. Choose the assertion type based on the result you need to check.

```ts
type EvalAssertion =
  | string                                                              // legacy LLM-judged
  | { type: "file-exists" | "regex-match" | "json-valid"; ...args }    // legacy script
  | { id: string; kind: "output" | "workspace" | "behavior" | "safety"; method: ...; ... }; // intent
```

## LLM-judged string assertions

A bare string uses the LLM judge. Anthropic's published format uses this form for prose claims.

```json
"The response summarizes the semantic-release plugins it installed."
```

The judge returns `{ passed, evidence }`. `evidence` cites the response or a workspace file that supports the verdict.

Use string assertions for summaries, intent, tone, or natural-language structure that a script cannot check reliably.

Use scripts for file presence, exact patterns, and JSON validity. They run faster and do not depend on paraphrase.

## Deterministic script assertions

Skeval includes three synchronous script types. They do not call a model.

### `file-exists`

```json
{ "type": "file-exists", "path": ".releaserc.json" }
```

The path is relative to the workspace root. A path-traversal check prevents access outside the workspace. Evidence includes the resolved path and file size.

### `regex-match`

```json
{ "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } }
```

Set `target` to `{ "file": "<relative-path>" }` or `"assistant-text"`. Write `pattern` as a JavaScript regular-expression string and escape backslashes for JSON.

### `json-valid`

```json
{ "type": "json-valid", "path": ".releaserc.json" }
```

Passes when the file parses as JSON. Evidence includes a type summary or the parse error.

## Intent assertions

Intent assertions use explicit `id`, `kind`, and `method` fields:

- `kind: "output"` with `method: "judge" | "regex" | "exact"` checks the response.
- `kind: "workspace"` with `method: "file-exists" | "file-contains" | "json-valid" | "snapshot-diff"` checks workspace state.
- `kind: "behavior"` and `kind: "safety"` define trace-aware checks. Skeval validates these inputs but does not yet grade them deterministically.

The stable ID supports cross-run comparisons. The kind identifies which run artifact the grader should read.

## How the grader fits these together

The grader in `src/evals/grade.ts` batches string assertions and `kind: "output"` assertions with `method: "judge"` into one judge call per case. Script assertions run synchronously. Only judged prose claims add model-call cost.

Before reading a file, the grader checks that its path stays inside the temporary workspace.

## Authoring guidelines

- Start with script assertions. Use the judge only for prose.
- Keep each case to two to five assertions.
- Check observable results rather than incidental wording.
- Use literal text checks only when the text is part of the contract, such as CLI output, public copy, commit messages, email subjects, or required safety language.
- Put exact wording requirements in `expected_output`, then use `regex-match` or an output assertion with `method: "exact"`.
- Do not copy instructions from `SKILL.md` into an assertion. Check their effect instead.
- Name specific actions and proper nouns. "The response names the conventionalcommits preset" is checkable; "You should explain it" is not.
