---
name: arc-creating-evals
description: >
  Authors an arc-skill-eval test suite for an existing skill.  Produces `evals/evals.json` in the target skill's directory plus any `evals/files/` fixtures the cases need.  Use whenever the user says "write evals for this skill", "add eval coverage", "create evals.json for this skill", "scaffold evals for this skill", or "make this skill testable".  Follows the Anthropic skill-eval methodology (evals/evals.json + assertion grading).  Produces output next to the target skill's SKILL.md so the eval travels with the skill.
---

# Creating Evals for a Skill

Generates an `arc-skill-eval` test suite (`evals/evals.json`) for an existing skill, so the author can show that the skill works. Runs in five phases. Stop and confirm with the user at each phase boundary.

**Format reference:** the docs site pages on [eval cases](https://andysolomon.github.io/arc-skill-eval/concepts/eval-cases/), [assertions](https://andysolomon.github.io/arc-skill-eval/concepts/assertions/), and [authoring evals](https://andysolomon.github.io/arc-skill-eval/authoring-evals/). `arc-skill-eval --help` lists every command.

---

## Phase 1: Locate and summarize the target skill

1. Confirm the target skill directory. Default to the nearest ancestor containing `SKILL.md`. Ask if ambiguous.
2. Read the target `SKILL.md`. Extract:
   - `name` (from YAML frontmatter)
   - `description`, which gives trigger-phrase candidates for routing-style cases
   - numbered phases or steps, each a candidate execution case
   - tools the skill expects to call (`read`, `bash`, `write`, `edit`, `grep`, `find`)
   - files the skill creates, edits, or reads
3. Write a one-paragraph summary back to the user. Ask: *"Did I capture the skill's behavior correctly?"* Iterate until they confirm before moving on.

---

## Phase 2: Define success upfront (Anthropic's four dimensions)

Ask the user about each dimension. Their answers drive every assertion you write.

1. **Outcome.** What file state, response content, or artifact proves the skill worked?
2. **Process.** Which tools must (or must not) be called? Which shell commands?
3. **Style.** Do tone, structure, or formatting matter? Usually they matter only for planning, documentation, or commit-message skills.
4. **Efficiency.** Is there an upper bound on tool calls or duration?

Record answers. These are the *only* things you'll assert.

---

## Phase 3: Draft a small, targeted case list (6–10 cases total)

Stay small. Evals are a signal, not an exhaustive spec. Write cases in this shape:

```json
{
  "id": "<stable-slug-or-number>",
  "prompt": "<one realistic user message>",
  "expected_output": "<human-readable description of success>",
  "setup": {
    "kind": "seeded",
    "sources": [{ "from": "files/<fixture-dir>", "to": "." }],
    "mountMode": "flatten-contents"
  },
  "assertions": [ ... ]
}
```

The `setup` block copies the contents of `<skillDir>/evals/files/<fixture-dir>/` to the workspace root, so assertion paths match what the skill sees. Leave `setup` out for cases that need no input files. Don't use the older `files` list: it copies each fixture to `files/<fixture-dir>/...` inside the workspace, not to the root.

Propose cases across these classes. **Aim for 6–10 cases.**

### Trigger cases (3–5)
Prove the skill gets invoked when it should.
- 1–2 **explicit**: the user names the skill (*"Use arc-conventional-commits to..."*).
- 1–2 **implicit positive**: derived from each major trigger phrase in the SKILL.md description.
- 1 **adjacent negative**: a prompt that *looks* like the skill's domain but asks for something else (e.g., *"Summarize this commit"* for a commit-message skill).

### Execution cases (1–3)
Prove the skill does real work.
- One fixture-backed golden-path case.
- One or two alternate paths if the skill has meaningfully different code paths (e.g., *repo already has semantic-release* vs *repo has nothing*).
- Each execution case uses the `setup` block above, and its fixture lives under `<skillDir>/evals/files/<fixture>/`.

### Edge / negative cases (1–2)
Prove the skill handles boundaries gracefully.
- Malformed input, ambiguous request, or conflict with existing state.

### Live-smoke cases (external-api skills only)
The runner has no live-smoke mode yet. Keep every case offline and credential-free. If the skill will need a live check eventually, say so in that case's `description` field and tell the user. JSON has no comments, so don't add one.

---

## Phase 4: Layer assertions per case

Apply assertions in priority order. Back weaker signals with stronger ones.

1. **Script assertions first.** They are deterministic, cheap, and reliable.
   - `{ "type": "file-exists", "path": "<relative>" }`: the file exists after the run.
   - `{ "type": "file-absent", "path": "<relative>" }`: the file does not exist after the run. Use it for "left no junk" and "did not overwrite" checks. The same check is available as `{ "kind": "workspace", "method": "file-absent" }`.
   - `{ "type": "regex-match", "pattern": "<regex>", "target": { "file": "<relative>" } }`: the pattern appears in a produced file.
   - `{ "type": "json-valid", "path": "<relative>" }`: the file parses as JSON.
2. **Behavior and safety assertions** when the *process* is the claim. The runner grades them from the run trace, with no model call, so prefer them over a judge string for "used or avoided a tool":
   - `{ "id": "<slug>", "kind": "behavior", "method": "tool-call-required", "value": "write" }`: the run called the tool. Add `"match": "<substring>"`, or `"match"` with `"matchKind": "regex"`, to check the tool input.
   - `{ "id": "<slug>", "kind": "behavior", "method": "tool-call-forbidden", "value": "bash" }`: the run did not call the tool.
   - `{ "id": "<slug>", "kind": "behavior", "method": "command-forbidden", "match": "<regex>", "matchKind": "regex" }`: no shell command matched.
   - `{ "id": "<slug>", "kind": "behavior", "method": "skill-read-required", "value": "<skill-name>" }`: the run read the skill's `SKILL.md`.
   - `{ "id": "<slug>", "kind": "safety", "method": "no-forbidden-files-touched", "config": { "paths": [".env", ".github"] } }`: the run never touched these paths.
   - Write tool names as the default `pi-sdk` runtime reports them: `read`, `bash`, `write`, `edit`. The match ignores case, so Claude Code's `Write` also matches `write`. Codex and other runtimes may use different names altogether.
   - A tool-input `match` tests the whole input, including file paths. Case workspaces live under `/tmp/arc-skill-eval-case-*`, so a pattern like `arc-skill-eval` matches every absolute path. Anchor command patterns to the start of the command, and pass `"value": "bash"` so only shell calls are checked.
   - Behavior and safety assertions require an `id`. Any assertion may declare `"mustPass": false` or `"severity": "info" | "warn"` to make a miss **soft**: it is recorded but fails the run only with `--strict`. Use soft assertions for style and quality signals you don't want to gate CI.
3. **String assertions** (LLM-judged) for properties a script or the trace cannot check:
   - Write them as short, specific claims about behavior that the judge can cite evidence for, not about incidental wording.
   - **Avoid** literal-quote tokens, heading-marker prefixes (`## Foo`), sentence-stem verbs (*"You should..."*), and phase-announcement wording. Models paraphrase.
   - **Prefer** action verbs and proper nouns (*"The response names the \"conventionalcommits\" preset"*, *"The output describes the removal of existing standard-version config"*, *"The assistant starts repository-specific setup rather than giving generic advice"*).
   - If exact wording is required (commit messages, CLI output, public copy, mandatory disclaimers), state that requirement in `expected_output` and use deterministic `regex-match` or structured `kind: "output", method: "exact"` assertions where possible.

**Budget:** 2–5 assertions per case. With more, one of them tends to fail for reasons unrelated to the skill.

---

## Phase 5: Write files, pin a model, validate, dry-run, summarize

1. **Write `<skillDir>/evals/evals.json`.** Pretty-print with 2-space indent. Validate the JSON parses before saving.

   **Optional: author in TypeScript instead of raw JSON.** For larger suites, hand-writing JSON gets error-prone. You may instead write `<skillDir>/evals/evals.eval.ts` with the typed builder and compile it to the same `evals/evals.json`. The runner still reads only `evals/evals.json`, never the `.eval.ts`.
   ```ts
   // evals/evals.eval.ts
   import { defineSkillEval, evalCase, seeded, fileExists, regexMatch, judge } from "arc-skill-eval/evals";

   export default defineSkillEval({
     skill_name: "arc-conventional-commits",
     cases: [
       evalCase({
         id: "trigger-explicit",
         prompt: "Set up semantic-release in this repo.",
         setup: seeded({ from: "files/clean-repo", to: ".", mountMode: "flatten-contents" }),
         assertions: [
           fileExists(".releaserc.json"),
           regexMatch("conventionalcommits"),
           judge("Summarizes the plugins it installed.").soft(),
         ],
       }),
     ],
   });
   ```
   ```bash
   arc-skill-eval emit <skillDir>            # compiles evals/evals.eval.ts to evals/evals.json
   arc-skill-eval emit <skillDir> --check    # CI drift guard: exit 1 if evals.json is out of date
   arc-skill-eval emit <skillDir> --json     # same, as a JSON result (an error object on failure)
   ```
   Helpers mirror the assertion ladder from Phase 4: script (`fileExists`, `fileAbsent`, `jsonValid`, `regexMatch`, `exact`), behavior and safety (`toolRequired`, `toolForbidden`, `skillReadRequired`, `noForbiddenFilesTouched`), and `judge` for LLM-graded claims. Chain `.soft()`, `.severity("warn")`, or `.id("<slug>")` to make a miss soft or pin an id. Chain `.atLeast(n)` to turn a judge into a **scored** check: the judge rates the output on a `1..5` rubric (or `.atLeast(8, { outOf: 10 })` for a custom ceiling), and the assertion passes if the score is at least `n`. `grading.json` records it as `score` and `scoreScale`. Use a scored judge for quality signals where a hard pass/fail is too blunt, and keep it `.soft()` unless you want to gate on it. `emit` validates through the same loader as `run`, so authoring errors (duplicate ids, bad shapes, `.atLeast` on a non-judge) fail at compile time. Commit **both** the `.eval.ts` and the generated `evals/evals.json`, and add `emit --check` to CI so they can't drift apart.
2. **Create any referenced fixtures** under `<skillDir>/evals/files/<fixture>/`. Keep each fixture minimal, with just enough files for the case to have something real to touch. Never commit node_modules, build outputs, or live credentials.
3. **Know which models will run and judge.** `evals.json` does not have a top-level `model` field. The runner model comes from `--model` or the author's Pi default. LLM-judged string assertions use, in order of precedence: `--judge-model`, else **the same model that ran the case** (always usable, since the run just used it), else a low-cost built-in fallback that needs its own credentials. With the runner-model default, the model grades its own output. Recommend `--judge-model <provider/model>` with a *different* model when that self-grading bias matters. Name the effective judge in your summary. `grading.json` records it as `judge_model`.
4. **Validate.** There is no separate validate command. `run` (and the browse TUI) validates `evals.json` every time it loads the file, and errors name the offending case or assertion. A JSON-parse check before saving plus a dry-run (next step) is the validation loop.
5. **Dry-run one case** against the cheapest model the author has auth for:
   ```bash
   arc-skill-eval run <skillDir> --case <first-routing-case-id> --json
   ```
   Parse stdout as one JSON object (don't merge stderr into it). If it has an `error` key, the run didn't complete: fix `error.message` (usually a missing key or bad model id) before judging any assertion. Otherwise read `summary` and `skills[0].cases[0].grading.assertion_results[]`. The `--json` notes in `arc-skill-eval --help` and the [CLI reference](https://andysolomon.github.io/arc-skill-eval/cli-reference/#--json) describe the output.
   Confirm it completes end-to-end and that at least one assertion grades honestly, then triage the evidence on any failure:
   - **`Judge error: ...`** is an infrastructure problem, not your assertion. The judge model itself failed, usually because of an unauthenticated provider or a bad model id. Fix the judge selection (`--judge-model`, provider auth) and leave the assertion alone.
   - **`Judge returned unparseable output`** means the judge responded, but not in the expected JSON shape. Retry once. If it persists, the judge model is too weak for the rubric, so pick a stronger `--judge-model`.
   - **Paraphrased evidence.** If the judge's evidence paraphrases instead of citing the text, tighten the assertion (make it more literal) or swap it for a script assertion.
6. **Summary.** Tell the user:
   - file path of the new `evals.json`
   - which fixtures were created and under what paths
   - how many cases per class, how many total assertions
   - the dry-run result (pass/fail + assertion summary)
   - the command to run the full suite
   - that the `arc-running-evals` skill can take over from here to run the suite, explain failures, and iterate
   - a reminder: *"Every manual fix is a signal. Add a new case whenever you debug a real regression."*

---

## Quality rules

- **Don't invent cases the skill isn't built for.** A trigger case the skill wasn't designed to respond to is noise, not a bug.
- **Test every string assertion against a real run before you rely on it.** Models reword their answers, and an untested judge string often fails on a correct answer.
- **Prefer behavior-focused assertions over exact wording.** Check artifacts, semantic actions, and routing outcomes. Don't require a heading, phase name, or skill-name mention unless that text is part of the user-facing contract.
- **Don't copy the skill's instructions into assertions verbatim.** If the skill says "The .releaserc.json MUST have conventionalcommits preset", an assertion that quotes that text won't distinguish skill output from regurgitation. Assert on the *effect* (`{ "type": "json-valid", "path": ".releaserc.json" }` + `{ "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } }`).
- **Prefer 1 execution case + strong script assertions over 3 execution cases + weak text matches.**
- **Never set an `id` that includes slashes or whitespace.** Use lowercase kebab-case slugs. Numbers are also fine. The CLI sanitizes ids for filesystem paths, but your ids should be readable as they are.
- **When in doubt, stop and ask.** Evals written by guessing produce false passes that teach the author nothing.
