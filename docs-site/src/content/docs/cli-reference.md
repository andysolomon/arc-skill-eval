---
title: CLI reference
description: Every arc-skill-eval command and flag, with model pinning, runtimes, compare mode, JSON output, and exit codes.
---

`arc-skill-eval` has twelve commands:

- `create` writes a starter or model-guided `evals/evals.json`.
- `run` executes a suite, grades it, and writes artifacts.
- `init-runtime` writes a small eval-owned Pi runtime directory.
- `review` turns a run into a static report and a `feedback.json` file.
- `improve` proposes suite changes from `feedback.json`.
- `browse` opens a terminal run browser.
- `audit` runs deterministic skill-quality checks.
- `optimize-description` tests and tunes the `SKILL.md` description for routing.
- `package` bundles a validated skill into a `.skill.tgz` file.
- `bundled` prints the paths of the skills that ship with the package.
- `emit` compiles a TypeScript suite into `evals/evals.json`.
- `install-skills` copies the agent-facing skills into a project.

## Synopsis

```text
arc-skill-eval run <skill-dir-or-repo>
                   [--skill <name>]...
                   [--case <id>]...
                   [--runtime pi-sdk|codex|claude-code|cursor-agent|copilot]
                   [--model <provider/model[:thinking]>]
                   [--judge-model <provider/model[:thinking]>]
                   [--agent-dir <path>]
                   [--output-dir <path>]
                   [--iteration <name>]
                   [--extra-skill <path>]...
                   [--context-mode isolated|ambient]
                   [--sandbox none|just-bash]
                   [--case-timeout <seconds>]
                   [--concurrency <n>]
                   [--trials <n>]
                   [--compare]
                   [--strict]
                   [--stamp]
                   [--laminar]
                   [--json]

arc-skill-eval init-runtime <agent-dir>
                            --provider <provider>
                            --model <model>
                            [--force]
                            [--json]

arc-skill-eval review <run-dir>
                      [--output <dir>]
                      [--force]
                      [--json]

arc-skill-eval improve --from-feedback <feedback.json>
                       [--dry-run]
                       [--summary | --json]
                       [--apply]

arc-skill-eval create <skill-dir>
                      [--guided]
                      [--interactive]
                      [--model <provider/model[:thinking]>]
                      [--agent-dir <path>]
                      [--authoring-skill <path>]
                      [--dry-run]
                      [--summary | --json]
                      [--force]

arc-skill-eval browse [<skill-dir-or-repo>]
                      [--no-baseline]

arc-skill-eval audit <skill-dir-or-repo>
                     [--json]
                     [--output <path>]

arc-skill-eval optimize-description <skill-dir>
                     --generate-only [--output <path>] [--force]
                   | --eval-set <path> [--distractor <skill-dir>]...
                                       [--max-iterations <n> [--apply]]
                     [--model <provider/model[:thinking]>]
                     [--agent-dir <path>]
                     [--json]

arc-skill-eval package <skill-dir>
                       [--output <path>]
                       [--force]
                       [--json]

arc-skill-eval bundled [<skill-name>]
                       [--json]

arc-skill-eval emit (<skill-dir> | --from <suite.eval.ts>)
                    [--out <evals/evals.json>]
                    [--check]
                    [--json]

arc-skill-eval install-skills [--target <project-root>]
                              [--harness claude-code|codex|cursor-agent|copilot|pi]...
                              [--skill <name>]...
                              [--force]
                              [--json]
```

## Commands

### `create <skill-dir>`

Scaffold a starter `evals/evals.json` next to a `SKILL.md` file:

```bash
arc-skill-eval create ./skills/my-skill
```

The command reads the `SKILL.md` frontmatter and writes three starter cases:

- `trigger-explicit`
- `execution-golden-path`
- `adjacent-negative`

If `SKILL.md` mentions an output file such as `plan.md` or `report.json`, the execution case also gets `file-exists` and `json-valid` assertions. If it mentions a likely input file such as `notes/input.md`, `requirements.md`, `prd.md`, `issue.md`, or `task.md`, the command seeds that file under `evals/files/starter-inputs/`. The adjacent-negative prompt is tailored to common skill types: eval authoring, planning, releases, docs, and auth or webhooks. Other skills get a generic prompt.

Use the deterministic form when the checks are mechanical, for example file-writing skills, JSON or config skills, CLI automation, or CI fixtures. Use guided mode when designing the cases is the hard part, for example conceptual skills, planning or review skills, routing behavior, and subtle adjacent negatives. Guided output is a proposal. Review it before you commit it.

Guided mode asks a configured Pi model to design the cases by following the bundled `skills/arc-creating-evals/SKILL.md` procedure:

```bash
arc-skill-eval create ./skills/my-skill --guided --dry-run --summary
```

The command validates the proposal with the same loader that `run` uses. If the model returns an invalid suite, the command fails with a validation error and writes nothing.

For a conceptual skill such as `grill-me`, prefer judge assertions and adjacent negatives over file assertions:

```bash
arc-skill-eval create .agents/skills/grill-me --guided --interactive
```

Useful assertions for that skill ask whether the assistant challenges assumptions, asks sharp follow-up questions, and stays in interview mode. Adjacent negatives check that ordinary editing or summarizing requests do not trigger the skill.

Options:

- `--guided`: ask the configured model to propose cases, fixture inputs, assertions, and a rationale.
- `--interactive`: review the guided proposal in the terminal before writing. You can keep or skip each case and assertion, and edit prompts, expected output, and judge or regex text. It needs a terminal and can't be combined with `--json`.
- `--model <provider/model[:thinking]>`: pin the model that designs the cases. Without it, guided mode uses the Pi default.
- `--agent-dir <path>`: load the model registry, settings, and auth for guided mode from an eval-owned Pi agent directory.
- `--authoring-skill <path>`: use a different authoring skill instead of the bundled `arc-creating-evals`. This is useful when you test a revised version of that skill.
- `--dry-run`: print the proposed suite without writing files.
- `--summary`: print a readable review of the cases, fixtures, rationale, and assertions. With `--dry-run`, it prints the summary instead of raw JSON.
- `--json`: print the result as one JSON object. See [JSON output](/arc-skill-eval/json-output/).
- `--force`: overwrite an existing `evals/evals.json`.

The overwrite check runs before the interactive prompts, so `--interactive` still refuses to replace an existing suite unless you pass `--force`.

### `init-runtime <agent-dir>`

Create a small eval-owned Pi runtime directory with `models.json` and `settings.json`:

```bash
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b
```

Options:

- `--provider <provider>`: `ollama-cloud` or `ollama`.
- `--model <model>`: the model ID to register and set as the Pi default for this runtime.
- `--force`: overwrite an existing `models.json` or `settings.json`. Without it, the command refuses.
- `--json`: print the result as one JSON object.

For Ollama Cloud, the generated `models.json` names the `OLLAMA_API_KEY` environment variable. It never stores the key itself.

### `review <run-dir>`

Write a static report for a run directory:

```bash
arc-skill-eval review ./skills/hello-world/evals-runs/<runId>
```

The command writes two files:

- `review.html` is a standalone report. It shows case summaries, assertion evidence, assistant output, timing, model and tool data when present, and both variants side by side for compare runs.
- `feedback.json` has one entry per case with a `status`, a `notes` field, and a `feedback` field for each variant. You fill these in, and `improve` reads them.

Options:

- `--output <dir>`: write the files to another directory instead of the run directory.
- `--force`: overwrite an existing `review.html` or `feedback.json`.
- `--json`: print the result as one JSON object.

### `improve --from-feedback <feedback.json>`

Propose suite changes from review feedback. Write the report first, then add your notes to `feedback.json`:

```bash
arc-skill-eval review ./skills/my-skill/evals-runs/<runId>
arc-skill-eval improve --from-feedback ./skills/my-skill/evals-runs/<runId>/feedback.json \
  --dry-run --summary
```

`improve` takes no positional argument. It finds the run and the suite from the `feedback.json` path.

Use it after a compare run when the report shows a neutral or negative delta, judge evidence that changes from run to run, missing fixtures, or assertions that pass without proving the skill helped.

The command reads your notes and the failed assertions in `feedback.json`, then proposes changes to prompts, assertions, fixtures, or adjacent-negative cases, each with a reason. It changes no files unless you pass `--apply`. With `--apply`, it adds validated improvement metadata to the matching cases and then reloads the suite to confirm it is still valid.

Options:

- `--from-feedback <feedback.json>`: the file that `review` wrote. Required.
- `--dry-run`: only propose changes.
- `--summary`: print a readable proposal instead of raw JSON.
- `--json`: print the result as one JSON object.
- `--apply`: write the validated improvement metadata to the matching `evals/evals.json`.

### `browse [<skill-dir-or-repo>]`

Open a terminal run browser over the artifacts under `evals-runs/`. The argument is a skill directory (it contains `evals/evals.json`) or a repo root. It defaults to the current directory.

```bash
arc-skill-eval browse ./skills/arc-conventional-commits   # one skill
arc-skill-eval browse .                                    # whole repo
```

The browser has four panels: Skills, Cases, Assertions, and Runs. The detail pane shows the selected case's prompt, grading evidence, metrics, tool calls, and the `with_skill` and `without_skill` comparison. It reads the `grading.json` and `timing.json` files that `run` writes, so it needs no setup. Press `?` for the keybinding overlay. Press `r` to re-run the selected skill or case and reload the results.

Options:

- `--no-baseline`: hide the `without_skill` rows in the detail pane.

`browse` needs a terminal and does not accept `--json`.

On terminals with fewer colors, the browser drops from truecolor to 16-color ANSI. Without a UTF-8 locale, it draws boxes and bars in ASCII. To force these fallbacks, set `NO_COLOR` or `FORCE_COLOR=0` for no color, or `ARC_TUI_ASCII=1` for ASCII glyphs. A re-run happens inside the browser's own process, so it needs no `arc-skill-eval` on `PATH`.

See [Browse (TUI)](/arc-skill-eval/browse/) for every panel and keybinding.

### `audit <skill-dir-or-repo>`

Check skill quality without calling a model. `audit` reports frontmatter problems, descriptions over 500 characters, long `SKILL.md` files, a missing `evals/evals.json`, broken local markdown links, trigger-heavy descriptions on user-invoked skills, and likely duplicate skill families.

For a skill that has a suite, `audit` also checks the suite itself:

| `category` | Severity | What it means |
| --- | --- | --- |
| `eval-suite` | high | `evals/evals.json` does not load, or a case's workspace cannot be set up. |
| `vacuous-assertion` | warn | The null run: `audit` sets up the case's workspace and grades its script assertions before any agent runs. This assertion already passes, usually because it checks a file the fixture seeded, so it cannot show the skill did anything. Keep it only if it guards content the run must not change. |
| `absence-only-case` | info | Every assertion in the case checks that something did not happen, so an agent that does nothing passes it. Make sure another case shows the same things happening. |
| `eval-sync` | warn | Skill files or suite files changed since [`run --stamp`](#--stamp) last recorded a passing run. The message names them. The old pass no longer covers them. |
| `eval-sync` | info | There is no `evals/sync.json`, so nothing shows which version of the skill the suite passed against. |
| `eval-coverage` | warn | A case's `metadata.covers` names a `SKILL.md` section that no longer exists. |
| `eval-coverage` | info | `SKILL.md` sections that no case covers. Reported only when at least one case uses `metadata.covers`. |

Judge assertions are skipped by the null run, because grading them needs a model. Assertions that check absence (`file-absent`, the `*-forbidden` behaviors, safety assertions) pass on a null run by design and are not reported one by one.

`audit` exits `0` even when it reports findings. To fail a CI job, read the finding counts in the `--json` output.

```bash
arc-skill-eval audit ./skills/arc-conventional-commits
arc-skill-eval audit . --json --output ./audit.json
```

Like `run`, the argument is a skill directory or a repo root. For a repo root, the command checks every `SKILL.md` and `evals/evals.json` pair it finds.

Options:

- `--json`: print a JSON report instead of readable text.
- `--output <path>`: write the report to a file instead of stdout.

### `optimize-description <skill-dir>`

Measure how well the `SKILL.md` description routes requests, then propose better descriptions. The command has three modes.

Generate a routing eval set. The model writes prompts that should trigger the skill and nearby prompts that should not, tags each one `train` or `test`, and saves them to `<skillDir>/evals/description-evals.json`. Review that file by hand before you use it.

```bash
arc-skill-eval optimize-description ./skills/my-skill --generate-only
```

Score the current description. For each prompt, the model gets one routing question with no tools. It sees the target description, the descriptions of sibling skills in the same parent folder, and any `--distractor` skills, in a rotated order. The report gives a verdict per prompt and the accuracy on the train and test splits.

```bash
arc-skill-eval optimize-description ./skills/my-skill \
  --eval-set ./skills/my-skill/evals/description-evals.json
```

Optimize. With `--max-iterations <n>`, the command proposes new descriptions from the train-split failures and picks the winner by test-split accuracy. It changes `SKILL.md` only when you also pass `--apply`. After writing, it reads the file back and restores the original if the new description does not load cleanly.

```bash
arc-skill-eval optimize-description ./skills/my-skill \
  --eval-set ./skills/my-skill/evals/description-evals.json \
  --max-iterations 5
```

Options:

- `--generate-only`: write a routing eval set. You must pass this or `--eval-set`.
- `--output <path>`: with `--generate-only`, write the eval set to this path instead.
- `--force`: with `--generate-only`, overwrite an existing eval set.
- `--eval-set <path>`: score the description against this eval set.
- `--distractor <skill-dir>` *(repeatable)*: add another skill's description to every routing question.
- `--max-iterations <n>`: propose and test up to `n` new descriptions.
- `--apply`: write the winning description to `SKILL.md`. It requires `--max-iterations`.
- `--model <provider/model[:thinking]>`: pin the model. Without it, the command uses the Pi default.
- `--agent-dir <path>`: load Pi config from an eval-owned agent directory.
- `--json`: print the result as one JSON object.

See [Optimize the description for routing accuracy](/arc-skill-eval/dogfooding/#optimize-the-description-for-routing-accuracy) for how to use the three modes together.

### `package <skill-dir>`

Validate a skill and bundle it into one file:

```bash
arc-skill-eval package ./skills/my-skill
```

The command first validates `SKILL.md` and `evals/evals.json`. It then writes `<name>.skill.tgz` to the current directory, where `<name>` is the skill name from the frontmatter. The archive holds the skill directory and a `manifest.json` file with a sha256 hash for every file. It leaves out `evals-runs/`, `node_modules/`, dot-files, and earlier `*.skill.tgz` files.

Options:

- `--output <path>`: write the archive to this path.
- `--force`: overwrite an existing archive. Without it, the command refuses.
- `--json`: print the result as one JSON object.

### `bundled [<skill-name>]`

Print the absolute paths of the skills that ship inside the npm package. With a name, print only that skill's path. Use it in a shell substitution so you never need to know where npm installed the package:

```bash
arc-skill-eval bundled
arc-skill-eval run "$(arc-skill-eval bundled hello-world)"
```

The package ships `hello-world`, `arc-creating-evals`, `arc-running-evals`, and `arc-evals-lite`.

Options:

- `--json`: print a JSON array of `{ "name", "path" }` objects. This is the one command whose JSON has no `schemaVersion`.

### `emit (<skill-dir> | --from <suite.eval.ts>)`

Compile a typed suite into `evals/evals.json`. A suite is a `.eval.ts` file that default-exports `defineSkillEval({...})` from `arc-skill-eval/evals`:

```ts
// skills/my-skill/evals/evals.eval.ts
import { defineSkillEval, evalCase, fileExists, judge } from "arc-skill-eval/evals";

export default defineSkillEval({
  skill_name: "my-skill",
  cases: [
    evalCase({
      id: "writes-greeting",
      prompt: "Create a greeting for Ada.",
      assertions: [fileExists("greeting.txt"), judge("The reply names greeting.txt")],
    }),
  ],
});
```

```bash
arc-skill-eval emit ./skills/my-skill
arc-skill-eval emit ./skills/my-skill --check
```

With a skill directory, `emit` reads `evals/evals.eval.ts` and writes `evals/evals.json` in the same folder. It also looks for `suite.eval.ts`, `evals.eval.mjs`, and `evals.eval.js`. The command validates the result with the same loader that `run` uses and transpiles TypeScript itself, so you need no build step. The runner only ever reads the JSON file.

Options:

- `--from <path>`: the suite file to compile, instead of a skill directory.
- `--out <path>`: where to write the JSON. It defaults to `evals/evals.json` next to the suite.
- `--check`: compare the committed `evals.json` with the suite instead of writing it. The command exits `1` when they differ. Use it in CI.
- `--json`: print the result as one JSON object.

### `install-skills`

Copy the bundled agent-facing skills into the folders that coding agents read skills from. After that, an agent can drive `arc-skill-eval` from its shell tool. See [Use it from an agent](/arc-skill-eval/agents/).

```bash
arc-skill-eval install-skills
arc-skill-eval install-skills --harness codex --harness claude-code --target ../my-project
arc-skill-eval install-skills --skill arc-evals-lite
```

Options:

- `--target <dir>`: the project root to install into. It defaults to the current directory and must already exist.
- `--harness <id>` *(repeatable)*: `claude-code` installs to `.claude/skills`. `codex`, `copilot`, and `pi` install to `.agents/skills`. `cursor-agent` installs to `.agents/skills` and `.cursor/skills`. Without this flag, the command installs to `.agents/skills` and `.claude/skills`.
- `--skill <name>` *(repeatable)*: install these bundled skills instead of the default two, `arc-creating-evals` and `arc-running-evals`.
- `--force`: replace an existing install. Without it, the command skips folders that already exist.
- `--json`: print `{ target, installed[], skipped[] }`.

The command copies each skill without its `evals/` folder.

### `run <skill-dir-or-repo>`

Find skills, set up fixtures, run each case, grade the assertions, and write artifacts. If the argument contains `evals/evals.json`, it is one skill. Otherwise the command treats it as a repo and runs every `SKILL.md` and `evals/evals.json` pair it finds.

The exit code is `0` when no case errors and no hard assertion fails, and `1` otherwise. See [`--strict`](#--strict) for soft assertions.

## Run flags

### `--skill <name>` *(repeatable)*

Run only the named skill. Use it when you point the CLI at a repo root with many skills.

```bash
arc-skill-eval run . --skill arc-conventional-commits
```

### `--case <id>` *(repeatable)*

Run only the cases with these IDs. Combine it with `--skill` to run one case in one skill.

```bash
arc-skill-eval run ./skills/hello-world --case default-world
arc-skill-eval run . --skill hello-world --case named-ada --case assistant-names-file
```

### `--runtime pi-sdk|codex|claude-code|cursor-agent|copilot`

Choose the agent that runs each case. The default is `pi-sdk`. The other four start the vendor's command-line agent in the case workspace, read its JSON event stream, and grade it with the same assertions and artifacts.

| Runtime | Binary | Credentials |
| --- | --- | --- |
| `pi-sdk` | none, bundled | Pi's `models.json` and auth |
| `codex` | `codex` | `CODEX_API_KEY` or `codex login` |
| `claude-code` | `claude` | `ANTHROPIC_API_KEY` or a Claude login |
| `cursor-agent` | `cursor-agent` | `CURSOR_API_KEY` |
| `copilot` | `copilot` | `COPILOT_GITHUB_TOKEN`, `GH_TOKEN`, or `GITHUB_TOKEN` |

```bash
arc-skill-eval run ./skills/hello-world --runtime claude-code
arc-skill-eval run ./skills/hello-world --runtime codex --model openai/<codex-model-id>
```

`--model` still takes the `provider/model` form. A command-line runtime receives the part after the slash. The command-line runtimes do not support `--sandbox just-bash`. The judge keeps its own credentials, set by `--judge-model`. See [Runtime and models](/arc-skill-eval/runtime-and-models/) and [`docs/multi-harness-runtimes.md`](https://github.com/andysolomon/arc-skill-eval/blob/main/docs/multi-harness-runtimes.md).

### `--model <provider/model[:thinking]>`

Pin the model that runs the skill. Without this flag, the run uses the default provider, model, and thinking level from your Pi settings.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-6-luna:medium
```

### `--judge-model <provider/model[:thinking]>`

Pin the model that grades judge assertions. Deterministic assertions such as `file-exists`, `regex-match`, and `json-valid` do not use it.

Without this flag, the judge uses the model that ran the case, because that model is known to be authenticated. If no runner model can be resolved, it uses `mistral/ministral-8b-latest`. The default means the model grades its own output, so pin a different judge when that bias matters.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-6-luna:medium \
  --judge-model mistral/ministral-8b-latest
```

Model IDs can contain colons. The CLI reads the last colon segment as a thinking level only when it is a known level, so an Ollama ID like `gpt-oss:20b` stays a model ID.

```bash
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

See [Runtime and models](/arc-skill-eval/runtime-and-models/) for provider setup, Pi defaults, and Ollama Cloud examples.

### `--agent-dir <path>`

Load the model registry, settings, and auth from an eval-owned Pi agent directory. Use it for team or CI runs that should not depend on a developer's personal `~/.pi/agent` settings.

```bash
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b
```

With this flag, both the runner and the default judge read their Pi config from that directory.

### `--output-dir <path>`

Write artifacts to another directory. The default is `<skillDir>/evals-runs/<runId>/`. In CI, use it to collect every artifact under one path.

```bash
arc-skill-eval run . --output-dir ./evals-runs
```

### `--iteration <name>`

Group a run under an iteration folder: `<skillDir>/evals-runs/iteration-<name>/<runId>/`. For example, `baseline` becomes `iteration-baseline`. Use one name per improvement cycle. The `browse` command can then compare a run with a pinned earlier run.

```bash
arc-skill-eval run ./skills/hello-world --iteration 1
arc-skill-eval run ./skills/hello-world --iteration baseline
```

### `--extra-skill <path>` *(repeatable)*

Load another skill into the model's context as a distractor or a conflict. The path is a skill directory or a `SKILL.md` file. With `--compare`, `with_skill` gets the target and the extras, and `without_skill` gets only the extras.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1
```

### `--context-mode isolated|ambient`

- `isolated` *(default)*: the run loads no ambient Pi skills, extensions, prompt templates, themes, or context files. The model sees only the target skill and any `--extra-skill` paths.
- `ambient`: the run loads your normal Pi resources, including extension tools and MCP tools when you have them configured.

Each variant's `context-manifest.json` records what the model could see.

```bash
arc-skill-eval run ./skills/arc-conventional-commits \
  --context-mode ambient \
  --iteration ambient-1
```

### `--sandbox none|just-bash`

- `none` *(default)*: each case runs in a temporary workspace with the host shell and the real filesystem.
- `just-bash`: the agent's `bash`, `read`, `write`, and `edit` tools go through one in-process [`just-bash`](https://www.npmjs.com/package/just-bash) virtual filesystem rooted at the case workspace. Commands never reach the host shell. `/` is the workspace, so an absolute path such as `/tmp/out.html` lands at `<workspace>/tmp/out.html`. The workspace is also visible at its real path, where the shell starts. Skills in context can be read at their real paths but not changed. Nothing else on the host is visible, and the repository's working tree is never touched. The run still captures generated files under `outputs/`. `npm`, `npx`, and `git` are mocks that succeed and do nothing by default.

This flag overrides each case's own `sandbox` field. You set per-case `sandbox` values and `sandboxMocks` (specific stdout, exit codes, and file effects) in `evals.json`. See [Eval cases](/arc-skill-eval/concepts/eval-cases/).

```bash
arc-skill-eval run . --sandbox just-bash
```

### `--case-timeout <seconds>`

Stop a case's agent after this many seconds and record the case as an error: "Case `<id>` timed out after `<n>`s; the agent was stopped." The limit covers the agent run, not grading. A command-line runtime gets SIGTERM, then SIGKILL 5 seconds later. For `pi-sdk`, the run aborts the session's prompt. Either way, the run removes the staged skills and the case's temporary workspace. There is no limit by default.

```bash
arc-skill-eval run . --runtime claude-code --case-timeout 600
```

Ctrl-C during `run` cancels it the same way. The run stops every running case, starts no new one, cleans up their temporary files, and exits with code 130. A second Ctrl-C exits at once without cleanup.

### `--concurrency <n>`

Runs up to `n` cases at once, across every selected skill. The default is 1, which runs cases one after another. Results, `errors[]`, and `--json` output keep `evals.json` order whatever order cases finish in. `--case-timeout` applies to each case separately, and Ctrl-C stops all running cases.

```bash
arc-skill-eval run . --runtime claude-code --concurrency 4
```

Each case still gets its own temporary workspace, so cases can't see each other's files. Parallel cases do share your provider's rate limits. The CLI harness runtimes (`codex`, `claude-code`, `cursor-agent`, `copilot`) run each case in its own process. `pi-sdk` runs every case's session inside the one `arc-skill-eval` process.

### `--trials <n>`

Run every case `n` times (default `1`) and write `trials.json` at the run root. It marks each assertion that passed in some trials and failed in others as `flaky`. With `--compare` it reports the median delta and its spread across trials, and calls the delta `measurable` only when the median is larger than the spread. A hard failure in any trial makes the exit code `1`. The first trial writes the usual artifacts; later trials write under `trial-<k>/`. Cost scales with `n`.

```bash
arc-skill-eval run ./skills/my-skill --compare --trials 3
```

### `--compare`

Run each case twice, once with the skill and once without it. Each variant gets a fresh workspace. The run writes a top-level `benchmark.json` with per-case pass rates and the overall delta.

```bash
arc-skill-eval run . --compare
```

See [Dogfooding and authoring loop](/arc-skill-eval/dogfooding/) for how to read the delta.

### `--strict`

Fail the run on soft assertion misses too. An assertion is soft when it sets `mustPass: false` or a `severity` of `info` or `warn`. By default, a soft miss is recorded in `grading.json` and counted in the summary, but the exit code stays `0`. With `--strict`, any soft miss makes the exit code `1`.

```bash
arc-skill-eval run ./skills/my-skill --strict
```

### `--stamp`

Write `<skillDir>/evals/sync.json` when every case of the suite passes. The record holds a hash of each skill file and each suite file, plus the commit when the skill is in a git repository. `audit` later compares it with the files on disk and reports a skill that changed under its suite. A failing run, a run narrowed with `--case`, or a run with a failed trial is not stamped; the result gives the reason in `skills[].sync.reason`. Commit `sync.json` with the suite.

```bash
arc-skill-eval run ./skills/my-skill --stamp
```

### `--json`

Print one JSON object on stdout instead of readable lines. Use it in CI scripts and when a coding agent drives the CLI.

```bash
arc-skill-eval run . --json
```

Every command except `browse` accepts `--json`. The object always includes `"schemaVersion": 1`. If the command can't complete, stdout holds `{"schemaVersion":1,"error":{"kind":"usage"|"command"|"internal","message":"..."}}` instead, and the exit code is `1`. An exit code of `1` *without* an `error` object means the run finished and something failed. [JSON output](/arc-skill-eval/json-output/) has the full contract.

### `--laminar`

Send the run to [Laminar](https://www.lmnr.ai/)'s Evaluations view. The export creates one evaluation per variant (`with_skill` and `without_skill`) and one scored datapoint per case, grouped by skill name. The run summary prints a dashboard URL for each evaluation. The flag is off by default. Without it, the run loads no Laminar code and makes no network calls. The local artifacts under `evals-runs/` stay the source of truth, and a failed export never fails the run.

When the flag is set, the run reads these environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `LMNR_PROJECT_API_KEY` | yes | The Laminar project API key. If it is missing, the command names it and stops before any case runs. |
| `LMNR_BASE_URL` | no | A different Laminar endpoint. |
| `LMNR_PROJECT_NAME` | no | The evaluation group name. The default is the skill name. |

```bash
LMNR_PROJECT_API_KEY=lmnr_... arc-skill-eval run . --laminar
```

The Laminar SDK (`@lmnr-ai/lmnr`) is an optional dependency that loads only when you pass the flag. If it is not installed, the run reports an error that names the package. See [External observability](/arc-skill-eval/concepts/artifacts/#external-observability-laminar) for how fields map to datapoints.

## Examples

```bash
# Scaffold a starter eval suite.
arc-skill-eval create ./skills/my-skill

# Preview a starter suite without writing files.
arc-skill-eval create ./skills/my-skill --dry-run

# Review generated cases and assertions as text.
arc-skill-eval create ./skills/my-skill --dry-run --summary

# Ask a model to design a richer suite, without writing it.
arc-skill-eval create ./skills/my-skill --guided --dry-run --summary

# Run every eval in every skill under the current repo.
arc-skill-eval run .

# Run one skill.
arc-skill-eval run ./skills/arc-conventional-commits

# Run one case inside one skill.
arc-skill-eval run ./skills/arc-conventional-commits --case 1

# Pin the same model for the runner and the judge.
arc-skill-eval run ./skills/arc-conventional-commits \
  --model openai-codex/gpt-6-luna:medium \
  --judge-model openai-codex/gpt-6-luna:medium

# Run a cheap smoke test on Ollama Cloud.
arc-skill-eval run ./skills/hello-world \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b

# Run the cases with Claude Code instead of Pi.
arc-skill-eval run ./skills/hello-world --runtime claude-code

# Fail on soft assertion misses as well.
arc-skill-eval run ./skills/hello-world --strict

# Create an eval-owned Pi runtime directory.
arc-skill-eval init-runtime ./.arc-skill-eval/pi-agent \
  --provider ollama-cloud \
  --model gpt-oss:20b

# Write a static review report for a run.
arc-skill-eval review ./skills/hello-world/evals-runs/<runId>

# Propose suite changes from review feedback.
arc-skill-eval improve --from-feedback ./skills/hello-world/evals-runs/<runId>/feedback.json \
  --dry-run --summary

# Use an eval-owned Pi runtime directory.
arc-skill-eval run ./skills/hello-world \
  --agent-dir ./.arc-skill-eval/pi-agent \
  --model ollama-cloud/gpt-oss:20b \
  --judge-model ollama-cloud/gpt-oss:20b

# Write artifacts somewhere else.
arc-skill-eval run . --output-dir ./evals-runs

# Compare with and without the skill under an iteration folder.
arc-skill-eval run ./skills/arc-conventional-commits --compare --iteration 1

# Add a distractor skill to test conflicts.
arc-skill-eval run ./skills/arc-conventional-commits \
  --compare \
  --extra-skill ./skills/release-please \
  --iteration conflict-1

# Load your normal Pi resources and record what the model saw.
arc-skill-eval run ./skills/arc-conventional-commits \
  --context-mode ambient \
  --iteration ambient-1

# Generate a routing eval set for the description.
arc-skill-eval optimize-description ./skills/my-skill --generate-only

# Bundle a validated skill into my-skill.skill.tgz.
arc-skill-eval package ./skills/my-skill

# Fail CI when evals.json is out of date with evals.eval.ts.
arc-skill-eval emit ./skills/my-skill --check

# Install the agent skills into the current project.
arc-skill-eval install-skills
```

## Help

```bash
arc-skill-eval --help          # every command's usage line
arc-skill-eval run --help      # one command's usage and notes
arc-skill-eval --version       # the installed version
```

`<command> --help` works for all twelve commands, and so does `arc-skill-eval help <command>`. With `--json`, help prints `{ "schemaVersion": 1, "command", "help" }` and `--version` prints `{ "schemaVersion": 1, "version" }`.
