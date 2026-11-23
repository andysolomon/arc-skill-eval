---
name: arc-maintaining-evals
description: >
  Brings an arc-skill-eval suite (`evals/evals.json`) back in line with a skill that changed after the suite last passed: finds what changed, decides whether the suite or the skill is wrong, updates the suite, proves it can still fail, and re-stamps the sync record. Use for "I edited SKILL.md, are the evals still right", "audit says the suite is stale", or "update the evals for the new skill". For a first suite use arc-creating-evals. To run a suite use arc-running-evals.
---

# Maintaining Evals for a Skill

A suite proves something about the skill it was written against. When the skill changes and the suite does not, the suite can keep passing while it describes a skill that no longer exists. That pass is the dangerous one, because it looks like proof. This skill finds those cases and fixes the suite.

You drive the `arc-skill-eval` CLI from your shell tool and read its `--json` output, the same way `arc-running-evals` does. Its rules on `--json`, exit codes and asking before you spend money apply here too.

## Outcomes

Give the suite one outcome and say which:

- **In sync.** Nothing changed since the last stamp that alters what the suite checks, and it passes.
- **Updated.** The skill changed, the suite now describes the new skill, and it passes.
- **Skill bug.** The suite describes the current skill, and the skill breaks a promise it still makes. This is a finding about the skill, not drift.
- **Blocked.** The suite could not be brought in line or could not run. Say exactly why.

A suite can be both updated and skill bug: the update makes it describe the skill again, and then a case fails on it.

## Edit scope

Edit only the skill's `evals/` folder: `evals.json`, an `evals.eval.ts` source if there is one, and fixtures under `evals/files/`. Never edit `SKILL.md` or the skill's other files during a pass. When a case fails on the current skill, do not weaken the assertion until it passes. Report it.

## Step 1: Ask the audit what changed

```bash
<cli> audit <skill-dir> --json
```

No model is called. Read `skills[0].findings`:

| `category` | What it tells you |
|---|---|
| `eval-sync` at `warn` | The message lists the skill files and suite files that changed since the stamp. Start from that list. |
| `eval-sync` at `info` | No sync record. Nothing says which version of the skill the suite passed against, so treat every part of the skill as changed. |
| `vacuous-assertion` | An assertion that already passes before any agent runs. It cannot show the skill did anything. |
| `absence-only-case` | A case that only checks things did not happen. An agent that does nothing passes it. |
| `eval-suite` | The suite does not load, or a case's workspace cannot be set up. Fix this first. |

No `eval-sync` finding means the files match the stamp. If nothing else is reported, the outcome is **in sync** and you are done.

## Step 2: Run the suite as it is

Ask before you spend. Then:

```bash
<cli> run <skill-dir> --json
```

Record the result before you change anything. A pass here does not say the suite is right. It says the old description still holds. A failure can be drift or a skill bug. Do not decide which until Step 5.

## Step 3: Read every change to the skill

`evals/sync.json` holds `commit` when the skill is in a git repository. Read the changes since then:

```bash
git log --oneline <commit>..HEAD -- <skill-dir>
git diff <commit> -- <skill-dir> ':!<skill-dir>/evals' ':!<skill-dir>/evals-runs'
```

If `dirty` is `true`, the stamp was written with uncommitted edits, so the diff can show too much. Without a commit, read each file the audit listed.

Put each change in one group:

- **No effect.** Wording, formatting, or a path the suite does not exercise. Check this against the cases, not against the commit message.
- **The suite no longer describes the skill.** A step was added, removed, renamed or reordered. An output file moved. A tool is now required or forbidden. The suite must change.
- **The promise changed on purpose.** The skill now promises something different, and the change says so: the description, the step text, a changelog line, the commit message. The assertion must change, and you cite that evidence.
- **The promise may be broken.** The skill changed, and nothing says the promise changed. Treat a failure that follows as a skill bug candidate.

## Step 4: Update from the skill, not from the result

Write the updates before you run again. Do not shape them by what makes a case pass.

- A new step or code path gets a new case. A removed one loses its case.
- Change what an assertion means only for a promise that changed on purpose. Write down the old assertion, the new one, and the evidence.
- Replace each `vacuous-assertion` with a check on something the run has to produce. Keep one only when it guards content the run must not change.
- Give each `absence-only-case` a partner case where the same thing does happen.
- If the suite is authored in TypeScript, edit `evals/evals.eval.ts` and run `<cli> emit <skill-dir>`.

Run `<cli> audit <skill-dir> --json` again. It should report no `eval-suite` finding and no new `vacuous-assertion`.

## Step 5: Run again and judge each result

```bash
<cli> run <skill-dir> --case <changed-id> --json
```

**A changed case passes.** It may have lost the ability to fail. Show that it has not. Ask first, because this runs each case twice:

```bash
<cli> run <skill-dir> --case <changed-id> --compare --json
```

Read `skills[0].benchmark.cases[].assertions[]`. Each row has `with_skill`, `without_skill` and `discriminates`. An assertion that passes without the skill too does not show the skill helped. Tighten it, or say in the report that it only guards against damage.

**A case fails.** Open `<outputDir>/eval-<id>/` and replay the failure against what the agent did (`assistant.md`, `outputs/`, `trace.json`):

- The agent followed the current `SKILL.md` and the assertion still expects the old behavior: the suite is wrong. Fix the suite and say what was wrong.
- The agent did not do what the current `SKILL.md` promises: skill bug. Name the step it skipped, give one line of evidence, and say what it costs the user. Do not edit the skill.

## Step 6: Stamp

When every change is accounted for and the whole suite passes:

```bash
<cli> run <skill-dir> --stamp --json
```

`skills[0].sync.stamped` is `true` when `evals/sync.json` was written. The CLI refuses to stamp a failing run or a run narrowed with `--case`, and gives the reason in `sync.reason`. Do not stamp a blocked suite, and do not hand-edit `sync.json`. Commit it with the suite.

## Report back

1. **Outcome**: in sync, updated, skill bug, or blocked.
2. **What changed in the skill**, and the group from Step 3 for each change.
3. **What changed in the suite and why**: for each edit, "the skill changed shape" or "the promise changed on purpose" with the evidence.
4. **Proof the updated checks can fail**: the `--compare` rows, or that it was not run and why.
5. **Skill bugs**, each in plain words: the step, the evidence, the cost.
6. **What the suite still does not cover.**

Say outright which failures were drift in the suite and which were bugs in the skill. For a suite that passed before you updated it and fails after, say that the old pass was on a stale description.
