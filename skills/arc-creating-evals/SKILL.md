---
name: arc-creating-evals
description: >
  Authors an arc-skill-eval test suite for an existing skill.  Produces `evals/evals.json` in the target skill's directory plus any `evals/files/` fixtures the cases need.  Use whenever the user says "write evals for this skill", "add eval coverage", "create evals.json for this skill", "scaffold evals for this skill", or "make this skill testable".  Follows the Anthropic skill-eval methodology (evals/evals.json + assertion grading).  Produces output next to the target skill's SKILL.md so the eval travels with the skill.
---

# Creating Evals for a Skill

Generates an `arc-skill-eval` test suite (`evals/evals.json`) for an existing skill so authors can prove — and show users — that the skill works. Runs in five phases. Stop and confirm with the user at each phase boundary.

**Format reference:** `docs/evals-json-pivot.md` ("Authoring format", "Assertion grading contract") and `src/evals/types.ts` in this repo.

---

## Phase 1 — Locate and summarize the target skill

1. Confirm the target skill directory. Default to the nearest ancestor containing `SKILL.md`. Ask if ambiguous.
2. Read the target `SKILL.md`. Extract:
   - `name` (from YAML frontmatter)
   - `description` — used to derive trigger-phrase candidates for routing-style cases
   - numbered phases / steps — each step is a candidate execution case
   - tools the skill expects to call (Read / Bash / Glob / Write / Edit / Grep)
   - files the skill creates, edits, or reads
3. Write a one-paragraph summary back to the user. Ask: *"Did I capture the skill's behavior correctly?"* Iterate until they confirm before moving on.

---

## Phase 2 — Define success upfront (Anthropic's four dimensions)

Ask the user about each dimension. Their answers drive every assertion you write.

1. **Outcome** — what file state, response content, or artifact proves the skill worked?
2. **Process** — which tools must (or must not) be called? Which shell commands?
3. **Style** — is tone / structure / formatting material? (Usually only for planning, documentation, or commit-message skills.)
4. **Efficiency** — any upper bound on tool calls or duration?

Record answers. These are the *only* things you'll assert.

---

## Phase 3 — Draft a small, targeted case list (10–15 cases total)

Stay small. Evals are a signal, not an exhaustive spec. Write cases in the following shape (from `src/evals/types.ts`):

```json
{
  "id": "<stable-slug-or-number>",
  "prompt": "<one realistic user message>",
  "expected_output": "<human-readable description of success>",
  "files": ["files/<fixture-dir>/..."],
  "assertions": [ ... ]
}
```

Propose cases across these classes, **6–10 cases is the sweet spot**:

### Trigger cases (3–5)
Prove the skill gets invoked when it should.
- 1–2 **explicit**: the user names the skill (*"Use arc-conventional-commits to..."*).
- 1–2 **implicit positive**: derived from each major trigger phrase in the SKILL.md description.
- 1 **adjacent negative**: a prompt that *looks* like the skill's domain but asks for something else (e.g., *"Summarize this commit"* for a commit-message skill).

### Execution cases (1–3)
Prove the skill does real work.
- One fixture-backed golden-path case.
- One or two alternate paths if the skill has meaningfully different code paths (e.g., *repo already has semantic-release* vs *repo has nothing*).
- Each execution case declares `files: ["files/<fixture>/..."]` and the fixture lives under `<skillDir>/evals/files/<fixture>/`.

### Edge / negative cases (1–2)
Prove the skill handles boundaries gracefully.
- Malformed input, ambiguous request, or conflict with existing state.

### Live-smoke cases (external-api skills only)
Not supported yet in the MVP. Defer for now; note in the file a `NOTE` comment if the skill needs them eventually.

---

## Phase 4 — Layer assertions per case

Apply assertions in priority order. Weaker signals should always be backed by stronger ones.

1. **Script assertions first** (deterministic, cheap, reliable):
   - `{ "type": "file-exists", "path": "<relative>" }` — required file after the run.
   - `{ "type": "regex-match", "pattern": "<regex>", "target": { "file": "<relative>" } }` — pattern must appear in a produced file.
   - `{ "type": "json-valid", "path": "<relative>" }` — file must parse as JSON.
2. **String assertions** (LLM-judged) for properties a script cannot check:
   - Write them as short, specific, evidence-requirable claims.
   - **Avoid** literal-quote tokens, heading-marker prefixes (`## Foo`), sentence-stem verbs (*"You should..."*). Models paraphrase.
   - **Prefer** action verbs + proper nouns (*"The response names the \"conventionalcommits\" preset"*, *"The output describes the removal of existing standard-version config"*).

**Budget:** 2–5 assertions per case. More than that and one will start failing for the wrong reasons.

---

## Phase 5 — Write files, pin a model, validate, dry-run, summarize

1. **Write `<skillDir>/evals/evals.json`.** Pretty-print with 2-space indent. Validate the JSON parses before saving.
2. **Create any referenced fixtures** under `<skillDir>/evals/files/<fixture>/`. Keep each fixture minimal — just enough files for the case to have something real to touch. Never commit node_modules, build outputs, or live credentials.
3. **Pin a model.** `evals.json` does not have a top-level `model` field; if the author's global Pi default is quota-capped (e.g., ChatGPT Plus `openai-codex`), recommend they set a `judgeModel` override at the CLI layer or update `~/.pi/agent/settings.json`. Call this out explicitly in your summary.
4. **Validate:**
   ```bash
   arc-skill-eval validate <skillDir>
   ```
   This uses the legacy validator path during the MVP and will be a no-op for `evals.json`-only skills; check by hand that the JSON parses cleanly via `readEvalsJson` semantics.
5. **Dry-run one case** against the cheapest model the author has auth for:
   ```bash
   arc-skill-eval run <skillDir> --case <first-routing-case-id>
   ```
   Confirm it completes end-to-end and that at least one assertion grades honestly. If the judge's evidence reads like it paraphrased instead of cited the text, tighten the assertion (make it more literal) or swap for a script assertion.
6. **Summary.** Tell the user:
   - file path of the new `evals.json`
   - which fixtures were created and under what paths
   - how many cases per class, how many total assertions
   - the dry-run result (pass/fail + assertion summary)
   - the command to run the full suite
   - a reminder: *"Every manual fix is a signal — add a new case whenever you debug a real regression."*

---

## Quality rules

- **Don't invent cases the skill isn't built for.** A trigger case the skill wasn't designed to respond to is noise, not a bug.
- **Don't write string assertions without testing against a real run first.** Model paraphrasing will ambush you otherwise.
- **Don't copy the skill's instructions into assertions verbatim.** If the skill says "The .releaserc.json MUST have conventionalcommits preset", an assertion that quotes that text won't distinguish skill output from regurgitation. Assert on the *effect* (`{ "type": "json-valid", "path": ".releaserc.json" }` + `{ "type": "regex-match", "pattern": "conventionalcommits", "target": { "file": ".releaserc.json" } }`).
- **Prefer 1 execution case + strong script assertions over 3 execution cases + weak text matches.**
- **Never set an `id` that includes slashes or whitespace.** Use lowercase kebab-case slugs; numbers are also fine. The CLI sanitizes for filesystem paths but your IDs should be readable as-is.
- **When in doubt, stop and ask.** Authoring evals by guessing produces false-positive passes that teach the author nothing.
