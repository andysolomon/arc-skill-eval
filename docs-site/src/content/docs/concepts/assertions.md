---
title: Assertions
description: Choose among judged strings, deterministic scripts, and structured intent assertions.
sidebar:
  order: 3
---

Assertions define what each case checks. Skeval grades them independently and writes one result per assertion to `grading.json`. Choose the assertion type based on the result you need to check.

```ts
type EvalAssertion =
  | string                                                                            // LLM-judged
  | { type: "file-exists" | "file-absent" | "regex-match" | "json-valid"; ...args }  // script
  | { id: string; kind: "output" | "workspace" | "behavior" | "safety"; method: ...; ... }; // intent
```

Only plain strings and `kind: "output"` assertions with `method: "judge"` call a model. Skeval grades every other assertion itself, from the workspace, the final response, or the run trace.

## LLM-judged string assertions

A bare string uses the LLM judge. Anthropic's published format uses this form for prose claims.

```json
"The response summarizes the semantic-release plugins it installed."
```

The judge returns `{ passed, evidence }`. `evidence` cites the response or a workspace file that supports the verdict.

Use string assertions for summaries, intent, tone, or natural-language structure that a script cannot check reliably.

Use scripts for file presence, exact patterns, and JSON validity. They run faster and do not depend on paraphrase.

## Deterministic script assertions

Skeval has four script types. They do not call a model.

### `file-exists`

```json
{ "type": "file-exists", "path": ".releaserc.json" }
```

The path is relative to the workspace root. A path-traversal check prevents access outside the workspace. Evidence includes the path and the file size.

### `file-absent`

```json
{ "type": "file-absent", "path": "notes/summary.md" }
```

Passes when nothing exists at the path after the run. A directory at the path fails the check. Use it for adjacent-negative cases, where the skill must not produce its usual output.

### `regex-match`

```json
{ "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } }
```

Set `target` to `{ "file": "<relative-path>" }` or `"assistant-text"`. Without `target`, the pattern is tested against the final response. Write `pattern` as a JavaScript regular-expression string and escape backslashes for JSON. `flags` is optional, for example `"i"`.

### `json-valid`

```json
{ "type": "json-valid", "path": ".releaserc.json" }
```

Passes when the file parses as JSON. Evidence includes a type summary or the parse error.

## Intent assertions

Intent assertions use explicit `id`, `kind`, and `method` fields. The stable `id` lets you compare one assertion across runs.

### `kind: "output"`

Checks the final response. `method` is one of:

- `judge`: an LLM-judged claim in `prompt`. Add `threshold` (and optionally `scaleMax`, default 5) to make it a scored judge that passes when the score reaches `threshold`.
- `regex`: `pattern` and optional `flags`, tested against the response.
- `exact`: the response must equal `expected`.

### `kind: "workspace"`

Checks files in the workspace after the run. `method` is one of `file-exists`, `file-absent`, `json-valid`, or `file-contains` (a `pattern` tested against the file at `path`). `snapshot-diff` is accepted by the loader but not implemented, so it always fails.

### `kind: "behavior"`

Skeval grades behavior assertions from the run trace, with no model call. `method` is one of:

| Method | Passes when |
|---|---|
| `tool-call-required` | Some tool call has the name in `value` (or any call, if `value` is absent) and its input matches `match`. |
| `tool-call-forbidden` | No tool call has that name and input. |
| `command-forbidden` | No shell command matches `match` (or `value`). |
| `skill-read-required` | The run read the `SKILL.md` of the skill named in `value` (or any skill). |
| `external-call-forbidden` | No recorded external call contains `value` (or no external call at all). |

Skeval records an external call when a shell command runs `gh`, runs `curl` or `wget` with a URL, or runs `git clone`, `fetch`, `pull`, or `push`. The recorded text looks like `http:curl api.github.com` or `git-remote:push`.

```json
{ "id": "wrote-config", "kind": "behavior", "method": "tool-call-required", "value": "write", "match": ".releaserc.json" }
```

Tool names match without regard to case. The default `pi-sdk` runtime reports `read`, `bash`, `write`, and `edit`, and Claude Code reports `Read`, `Bash`, `Write`, and `Edit`, so `"value": "write"` matches either. Other runtimes may use different names altogether. Skill names match exactly.

`match` is a substring by default, or a regular expression with `"matchKind": "regex"`. It is case-sensitive. For a tool call, it is tested against a summary of the input. Under `pi-sdk`, that summary is the command for `bash` and the path for `read`, `write`, and `edit`. Paths are often absolute, and case workspaces live under the system temp directory as `project-*`, so a loose pattern can match a path by accident. Anchor command patterns to the start of the command, and set `"value": "bash"` so only shell calls are checked.

The `codex`, `claude-code`, `cursor-agent`, and `copilot` runtimes record tool calls but not shell commands, skill reads, file writes, or external calls. Under those runtimes, `skill-read-required` always fails, and `command-forbidden`, `external-call-forbidden`, `no-forbidden-files-touched`, and `no-live-external-calls` always pass.

### `kind: "safety"`

- `no-forbidden-files-touched` fails when the run wrote or edited a path listed in `config.paths`. A listed path matches the same path, anything under it, or any path that contains it.
- `no-live-external-calls` fails when the trace records any external call.
- `custom` is accepted by the loader but not implemented, so it always fails.

### Soft assertions

An intent assertion may declare `"mustPass": false` or `"severity": "info" | "warn"`. A miss is then recorded as soft and fails the run only with `--strict`. Plain strings and script assertions ignore these fields, so use the `kind: "workspace"` form for a soft file check.

## How the grader fits these together

The grader in `src/evals/grade.ts` batches string assertions and `kind: "output"` assertions with `method: "judge"` into one judge call per case. The assertion engine in `src/evals/assertion-engine.ts` grades everything else without a model call. Only judged prose claims add model-call cost.

Before reading a file, the grader checks that its path stays inside the temporary workspace.

## Authoring guidelines

- Start with script assertions. Use the judge only for prose.
- Keep each case to two to five assertions.
- Check observable results rather than incidental wording.
- Use literal text checks only when the text is part of the contract, such as CLI output, public copy, commit messages, email subjects, or required safety language.
- Put exact wording requirements in `expected_output`, then use `regex-match` or an output assertion with `method: "exact"`.
- Do not copy instructions from `SKILL.md` into an assertion. Check their effect instead.
- Name specific actions and proper nouns. "The response names the conventionalcommits preset" is checkable; "You should explain it" is not.
