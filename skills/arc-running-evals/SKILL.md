---
name: arc-running-evals
description: >
  Runs an existing arc-skill-eval suite (`evals/evals.json`) from the shell, reads the JSON result, and explains which cases passed, which failed, and why. Then drives the fix loop: review → improve → re-run only the failing cases. Use whenever the user says "run the evals", "do this skill's evals pass", "benchmark this skill", "compare with and without the skill", "why did eval <id> fail", "check the eval run", or "re-run the failing evals". Works from any agent harness that has a shell tool (Claude Code, Codex, Cursor Agent, Copilot CLI, Pi). For writing a new suite, use arc-creating-evals instead.
---

# Running Evals for a Skill

Drives the `arc-skill-eval` CLI to run a skill's eval suite, then turns the result into a clear verdict and a next step. You run the CLI through your shell tool and read its `--json` output. You never scrape human-readable text.

**Contract reference:** `docs/cli-json-contract.md` in the arc-skill-eval repo.

---

## Rules that apply to every step

1. **Always pass `--json`, and parse stdout as one JSON object.** Don't merge stderr into stdout (no `2>&1`). Progress and warnings go to stderr.
2. **Read the verdict from the JSON, not only the exit code:**
   - The object has an `error` key: the command did not complete. Report `error.kind` (`usage`, `command`, `internal`) and `error.message`, then fix the invocation or stop. Never describe this as "the evals failed."
   - No `error`, exit code 1: the evals ran and something failed. That is a result to explain, not a crash.
   - No `error`, exit code 0: everything required passed.
3. **Never start `browse` or `create --interactive`.** They need a terminal, and they refuse to start without one.
4. **Spend money only with consent.** Every case is at least one model run, plus judge calls. Start with one case. Ask the user before you:
   - run the full suite,
   - add `--compare`, which runs every case twice (with and without the skill),
   - run more than one `--runtime`,
   - pick a `--runtime` that is the harness you are running in (for example `--runtime claude-code` from inside Claude Code). That starts a second, nested agent with its own credentials and cost.
5. **Never weaken a suite to make it pass.** Don't delete, soften, or loosen assertions, or mark cases soft, without telling the user what you changed and why. A real skill failure is the useful result.

---

## Step 1: Find the CLI and the suite

1. Find the CLI. Try `arc-skill-eval --help`. If that fails, try `npx --yes arc-skill-eval --help`. Use whichever works as `<cli>` for the rest of the session. If neither works, tell the user to run `npm install --global arc-skill-eval` and stop.
2. Find the target skill directory: the folder with `SKILL.md` and `evals/evals.json`. If the user names a repo root instead, `run` discovers every skill under it. Use `--skill <name>` to narrow.
3. Read `evals/evals.json` and list the case `id`s. Pick the cheapest case for the smoke run. Prefer one with deterministic assertions (`file-exists`, `regex-match`, `json-valid`, behavior assertions) over one that relies only on judge strings.
4. Check credentials before spending anything:
   - The default runtime `pi-sdk` needs a Pi provider key (or an `--agent-dir` from `<cli> init-runtime`).
   - `codex`, `claude-code`, `cursor-agent`, and `copilot` read keys from environment variables (`CODEX_API_KEY`, `ANTHROPIC_API_KEY`, `CURSOR_API_KEY`, `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`).
   - If the user didn't say which runtime or model to use, ask. Don't guess a paid model.

## Step 2: Smoke-run one case

```bash
<cli> run <skill-dir> --case <id> --json
```

Add `--model <provider/model>` and `--judge-model <provider/model>` when the user named them. Recommend a judge model different from the runner model: by default the runner grades its own output.

If the result has `error`, fix it before going further. Usually it's a missing key, a bad model id, or a wrong path.

## Step 3: Run the suite (after the user agrees)

```bash
<cli> run <skill-dir> --json                 # every case
<cli> run <skill-dir> --compare --json       # with vs without the skill (2x cost)
<cli> run <skill-dir> --strict --json        # soft misses also fail the run
```

## Step 4: Read the result

From the `run --json` object:

- `summary`: `totalCases`, `passedCases`, `failedCases`, `totalAssertions`, `failedAssertions` (hard), `softFailedAssertions` (only fail with `--strict`), `assertionPassRate`.
- `skills[]`: one per skill. `outputDir` is the run directory, `<skillDir>/evals-runs/<runId>`. `errors[]` lists cases that crashed rather than failed. `benchmark.summary.delta` is the with-minus-without pass-rate change when `--compare` was used.
- `skills[].cases[]`: `caseId`, plus `grading.summary` (`passed`/`failed`/`total`) and `grading.assertion_results[]` (`text`, `passed`, `evidence`).

For each failing case, open `<outputDir>/eval-<caseId>/`. With `--compare`, look under `with_skill/` and `without_skill/`. Read:

- `grading.json`: which assertion failed and the evidence for it.
- `assistant.md`: what the agent said.
- `outputs/`: the files it left behind.
- `tool-summary.json` / `trace.json`: which tools it called.

## Step 5: Diagnose each failure

Put every failing assertion in exactly one bucket and say which:

| Bucket | Signs | Next step |
|---|---|---|
| **Skill bug** | The output really is wrong. The skill skipped a step or wrote the wrong file. | Propose a `SKILL.md` change. |
| **Eval bug** | The output is fine, but the assertion is brittle: exact wording, wrong path, a judge string that's too strict. | Propose an assertion fix and show the evidence. |
| **Environment** | The case is in `errors[]`, a key is missing, a timeout, the harness exited non-zero. | Fix the setup. This says nothing about the skill. |

## Step 6: Review and improve (optional, ask first)

```bash
<cli> review <outputDir> --json
```

This writes `review.html` and a `feedback.json` skeleton, and returns their paths. Fill each case's `status` (`approved`, `pass`, or anything else to flag it) and `notes` / `variants[].feedback` with your diagnosis from Step 5. Then:

```bash
<cli> improve --from-feedback <feedbackPath> --json            # proposes changes, writes nothing
<cli> improve --from-feedback <feedbackPath> --apply --json    # only after the user approves
```

## Step 7: Re-run only what failed

```bash
<cli> run <skill-dir> --case <id-1> --case <id-2> --json
```

Stop when the targeted cases pass or the user says stop. Then offer one full-suite run to confirm nothing else broke.

## Report back

Keep it short and in this order:

1. **Verdict**: passed/failed cases and assertions, plus the `--compare` delta if one was run.
2. **Failures**: for each, the case id, the failing assertion, one line of evidence, and the bucket from Step 5.
3. **Artifacts**: the run directory (`outputDir`) and `review.html` if you made one.
4. **Next step**: one concrete recommendation, plus what it will cost to run.
