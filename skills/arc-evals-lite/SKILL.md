---
name: arc-evals-lite
description: >
  Creates and runs evals for an agent skill (`evals/evals.json` next to its SKILL.md) with nothing to install: the agent you are already using does the work. Use when the user says "write evals for this skill", "make this skill testable", "run this skill's evals", "does this skill actually work", or "test this skill with and without it", and the arc-skill-eval CLI is not installed. If `arc-skill-eval` is on PATH, prefer the arc-creating-evals and arc-running-evals skills, which add trace-based checks, sandboxing, and CI exit codes.
---

# Skill evals, lite

Writes and runs skill evals in the same `evals/evals.json` format the arc-skill-eval CLI uses, with no CLI. Suites written here run unchanged under the full CLI later.

**What lite can and can't do. Tell the user this before the first run.**

| | Lite |
|---|---|
| Write `evals/evals.json` and fixtures | Yes |
| File and text checks (`file-exists`, `file-absent`, `json-valid`, `regex-match`), plus judge assertions in plain English | Yes |
| Run each case in a fresh, isolated agent | Only if this harness can start one (Step R1). **Otherwise, refuse to run.** |
| With- vs without-skill comparison | Yes when isolation works, but with few samples. Treat it as a signal, not a benchmark. |
| Tool-call checks (`kind: "behavior"` / `"safety"`), sandboxing, timing and cost, CI exit codes | No. Record these as skipped and point to the CLI. |

## Step 0: Pick the mode

1. Run `arc-skill-eval --help`. If it succeeds, tell the user the full CLI is installed and recommend it (`arc-skill-eval run <skill-dir> --json`, or the arc-running-evals skill). Continue in lite only if they ask.
2. **Create mode** if the skill has no `evals/evals.json`, or the user asks to write or extend evals.
3. **Run mode** if the user asks to run, test, or compare.

---

## Create mode

### C1: Understand the skill

Read the target `SKILL.md`. Note its `name`, its trigger phrases (from `description`), its steps, and the files it reads or writes. Summarize the skill back to the user in one paragraph and wait for them to confirm. Then ask what proves it worked: which files, what content, what the response must say. Assert only what they confirm.

### C2: Draft 4–8 cases

- **Trigger, explicit (1):** the prompt names the skill.
- **Trigger, implicit (1–2):** a realistic request that matches the description without naming the skill.
- **Adjacent negative (1):** looks like the skill's domain but asks for something else. Assert that the skill's output does *not* appear (`file-absent`).
- **Execution (1–2):** a fixture-backed golden path. Put input files under `evals/files/<fixture>/`.
- **Edge (0–1):** an ambiguous or malformed request.

### C3: Assertions, strongest first

```json
{ "type": "file-exists",  "path": "out/report.md" }
{ "type": "file-absent",  "path": "out/report.md" }
{ "type": "json-valid",   "path": "config.json" }
{ "type": "regex-match",  "pattern": "Hello, \\w+!", "target": { "file": "greeting.txt" } }
{ "type": "regex-match",  "pattern": "created", "flags": "i" }
"The response tells the user which file it wrote."
```

- A `regex-match` without `target` checks the agent's final response. Paths are relative to the case workspace.
- A plain string is a judge assertion. Back it with a deterministic check whenever you can.
- Prefer checking effects over exact wording. Don't copy the skill's own text into assertions.
- If the user wants a tool-call check, you may write a `kind: "behavior"` assertion for the CLI to grade later, but tell them lite will skip it. It needs an `id`, and the tool name must match the agent's own spelling exactly. Pi's tools are lowercase:

  ```json
  { "id": "wrote-the-report", "kind": "behavior", "method": "tool-call-required", "value": "write" }
  ```

### C4: Write the file

```json
{
  "version": "1",
  "skill_name": "<name from frontmatter>",
  "evals": [
    {
      "id": "golden-path",
      "prompt": "<one realistic user message>",
      "expected_output": "<what success looks like, for humans>",
      "files": ["files/clean-repo/package.json"],
      "assertions": [ ... ]
    }
  ]
}
```

Rules:
- `id`s are unique lowercase kebab-case.
- `files` paths are relative to `evals/` and are copied into the workspace at the same relative path.
- To copy a whole fixture folder to the workspace root instead, use `"setup": { "kind": "seeded", "sources": [{ "from": "files/<fixture>", "to": "." }], "mountMode": "flatten-contents" }`.

Parse the file once to confirm it is valid JSON. Then tell the user: the path, the case list, and that run mode (or the CLI) can execute it.

---

## Run mode

### R1: Confirm you can isolate each case, or stop

Every case must run in a **fresh agent that has never seen this conversation, the evals file, or the expected answers**. If you answer the prompt yourself, you are grading your own homework, and the result means nothing. Use the first of these that works:

1. **A sub-agent tool** that starts a new agent with an empty context, for example a Task/Agent tool.
2. **A headless agent CLI on PATH**, run with the case workspace as its working directory:

   | Binary | Command |
   |---|---|
   | `claude` | `claude -p "<prompt>" --permission-mode bypassPermissions --no-session-persistence` |
   | `codex` | `codex exec -C <workspace> --sandbox workspace-write --skip-git-repo-check --ephemeral "<prompt>"` |
   | `cursor-agent` | `cursor-agent -p --force --trust --workspace <workspace> "<prompt>"` |
   | `copilot` | `copilot -p "<prompt>" --allow-all` |
   | `pi` | `pi -p "<prompt>"` |

   Test for each binary with `command -v <binary>`. Don't use `which`: some shells lack it, and it can miss a binary that is there. Check `<binary> --help` if a flag is rejected. These run with file-write permission, so only run them inside the temporary workspace.

**If neither works, don't run anything.** Say that this harness can't start an isolated agent, so lite can't produce a trustworthy result here. Offer create mode, or the full CLI (`npm install --global arc-skill-eval`). Never simulate a run, and never write a `grading.json` for a case that wasn't actually run.

### R2: Agree on scope and cost

Each case is one full agent run, plus one more if you add a without-skill baseline, plus a judge call for each plain-English assertion. Start with **one case, with the skill only**. Ask before running the whole suite or adding the baseline. Use the run id the user gives you; otherwise use `lite-<UTC yyyymmdd-hhmmss>`.

**Skip any case that declares `sandbox` or `sandboxMocks`.** Lite has no sandbox, so the commands that case expects to be mocked would run for real. Don't run it and don't write results for it. List it in the report as skipped, with the reason "needs the arc-skill-eval CLI (sandbox)".

### R3: Run one case

1. **Workspace:** create a fresh empty temporary directory with `mkdir -p`, at a path that doesn't exist yet, such as `${TMPDIR:-/tmp}/<runId>/<caseId>-<variant>`. Don't rely on `mktemp`: some shells lack it. Copy in the case's `files` and `setup` sources.
2. **Attach the skill** (with-skill variant only): copy the skill folder, without its `evals/` and `evals-runs/`, into `<workspace>/.agents/skills/<name>/` and `<workspace>/.claude/skills/<name>/`. Skip this for the without-skill variant.
3. **Prompt the fresh agent** with exactly:
   - the case `prompt`, word for word;
   - for a sub-agent only: "Work only inside `<workspace>`." In the with-skill variant also add: "Skills you may use are in `<workspace>/.agents/skills/`. Read a skill's SKILL.md if it applies."

   **Never** include `expected_output`, the assertions, or anything else from `evals.json`.
4. **Capture** the agent's final response verbatim.
5. **Grade** every assertion against that workspace and response:
   - `file-exists` / `file-absent`: test the path.
   - `json-valid`: parse the file.
   - `regex-match`: apply `pattern` with `flags` to the target file, or to the response if there's no target.
   - **Judge strings:** use a separate fresh sub-agent (or headless call) as the judge. Give it only the assertion, the response, and the contents of files the assertion mentions. Ask for `{"passed": true|false, "evidence": "<quote>"}`. If you have no way to start a separate judge, judge it yourself and record `"judge": "self"`.
   - `kind: "behavior"` / `"safety"` (and other unsupported kinds): don't grade them. Record them as skipped with the reason "needs the arc-skill-eval CLI (trace-based)".

### R4: Write results in the CLI's layout

Under `<skillDir>/evals-runs/<runId>/eval-<caseId>/`, or `.../eval-<caseId>/with_skill/` and `.../without_skill/` when you ran a baseline:

- `assistant.md`: the captured response.
- `outputs/`: a copy of the workspace, without `.agents/` and `.claude/`.
- `grading.json`:

```json
{
  "case_id": "golden-path",
  "lite": true,
  "isolation": "subagent | claude | codex | cursor-agent | copilot | pi",
  "assertion_results": [
    {
      "text": "file-exists: greeting.txt",
      "passed": true,
      "evidence": "greeting.txt exists (14 bytes)",
      "assertion": { "type": "file-exists", "path": "greeting.txt" }
    }
  ],
  "skipped": [ { "text": "behavior:tool-call-required: write", "reason": "needs the arc-skill-eval CLI (trace-based)" } ],
  "summary": { "passed": 1, "failed": 0, "soft_failed": 0, "total": 1, "pass_rate": 1 }
}
```

`assertion` is the assertion exactly as `evals.json` has it: the object for a script check, the string for a judge assertion. The CLI's run browser reads it to tell the two apart, so include it in every result. `total` counts graded assertions only, not skipped ones. Delete the temporary workspace when you're done.

### R5: Report

1. Label the results: **lite results are indicative only; there are few samples and no trace-based checks.**
2. Per case: pass/fail counts, each failing assertion with its evidence, and skipped assertions. Name each case you skipped because it needs a sandbox.
3. With a baseline: the pass rate with and without the skill, and the difference.
4. The results folder.
5. One next step. For CI gating, tool-call checks, or a real benchmark, that's the full CLI: `arc-skill-eval run <skill-dir> --compare --json`.
