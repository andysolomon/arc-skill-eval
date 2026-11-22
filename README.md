# arc-skill-eval

arc-skill-eval tests agent skills. It runs each case in a skill's `evals/evals.json` through a coding agent, grades the result, and can run the same case without the skill to show what the skill changed.

The suite format is [Anthropic's `evals/evals.json`](https://platform.claude.com/docs/en/agents-and-tools/agent-skills), so a suite written here runs in other tools that read that format.

## Install

```bash
npm install --global arc-skill-eval
```

You need Node.js 22.19 or later and one agent to run the cases:

- Pi is the default. The Pi SDK ships with the package and reads models and API keys from `~/.pi/agent`. See [Runtime and models](https://andysolomon.github.io/arc-skill-eval/runtime-and-models/).
- Claude Code, Codex, Cursor Agent, and GitHub Copilot CLI work through `--runtime`. See [running with other agent CLIs](docs/multi-harness-runtimes.md).

## Quickstart

Run the bundled example skill:

```bash
arc-skill-eval run "$(arc-skill-eval bundled hello-world)"
```

Test your own skill:

```bash
# Write a starter evals/evals.json next to SKILL.md
arc-skill-eval create ./skills/my-skill

# Run every case with the skill and without it
arc-skill-eval run ./skills/my-skill --compare

# Write review.html and feedback.json for that run
arc-skill-eval review ./skills/my-skill/evals-runs/<runId>

# Open the results in the terminal
arc-skill-eval browse ./skills/my-skill
```

`run` exits `0` when every assertion passes, `1` when one fails or a case errors, and `130` when you cancel with Ctrl-C.

## Write a suite

A suite lives at `<skill-dir>/evals/evals.json`:

```json
{
  "skill_name": "greeter",
  "evals": [
    {
      "id": "named-ada",
      "prompt": "Create a greeting for Ada.",
      "expected_output": "greeting.txt contains 'Hello, Ada!'.",
      "assertions": [
        { "type": "file-exists", "path": "greeting.txt" },
        { "type": "regex-match", "pattern": "^Hello, Ada!$", "target": { "file": "greeting.txt" } },
        "The response names the file it wrote."
      ]
    }
  ]
}
```

Each case runs in a temporary workspace. Scripts check the `file-exists`, `file-absent`, `regex-match`, and `json-valid` assertions. A model grades each plain-string assertion against the response and the files the case produced. Pin the models with `--model` and `--judge-model`.

[Authoring evals](https://andysolomon.github.io/arc-skill-eval/authoring-evals/) covers fixtures, sandboxed cases, and how to choose assertions.

## Commands

| Command | What it does |
| --- | --- |
| `run <skill-dir-or-repo>` | Runs the cases and grades them. `--compare` adds a run without the skill. |
| `create <skill-dir>` | Writes a starter suite. `--guided` asks a model to propose the cases. |
| `review <run-dir>` | Writes `review.html` and `feedback.json` for a run. |
| `improve --from-feedback <file>` | Proposes suite changes from your review notes. |
| `browse [<skill-dir-or-repo>]` | Opens the terminal run browser. |
| `audit <skill-dir-or-repo>` | Checks skill files without calling a model. |
| `optimize-description <skill-dir>` | Tests and rewrites the skill's trigger description. |
| `emit <skill-dir>` | Compiles a TypeScript suite to `evals/evals.json`. |
| `package <skill-dir>` | Validates a skill and bundles it into a `.skill.tgz`. |
| `install-skills` | Copies the agent-facing skills into a project. |
| `init-runtime <agent-dir>` | Writes a Pi config directory that the evals own. |
| `bundled [<skill-name>]` | Prints the paths of the skills shipped in the package. |

`arc-skill-eval --help` lists every flag. The [CLI reference](https://andysolomon.github.io/arc-skill-eval/cli-reference/) explains them.

## What a run writes

```text
<skill-dir>/evals-runs/<runId>/
├── benchmark.json            # only with --compare
└── eval-<case-id>/
    ├── assistant.md          # the agent's final response
    ├── outputs/              # files the case produced
    ├── grading.json          # one verdict and its evidence per assertion
    ├── timing.json           # duration, model, tokens, cost
    ├── trace.json            # the normalized run trace
    ├── tool-summary.json     # tool calls, errors, skill reads
    └── context-manifest.json # skills and tools the model could see
```

With `--compare`, each case directory holds a `with_skill/` and a `without_skill/` copy of these files. [Artifacts](https://andysolomon.github.io/arc-skill-eval/concepts/artifacts/) documents every field.

## Use it from an agent

Two bundled skills let a coding agent drive the CLI from its shell tool. `arc-creating-evals` writes a suite. `arc-running-evals` runs one, explains the result, and repeats the review and improve steps.

```bash
arc-skill-eval install-skills   # writes .agents/skills/ and .claude/skills/ in the current project
```

Every command except `browse` accepts `--json` and prints one JSON object. `browse` and `create --interactive` exit with an error when no terminal is attached. [The JSON contract](docs/cli-json-contract.md) lists the output shapes and exit codes.

A third skill, `arc-evals-lite`, writes and runs the same suites with no CLI installed, using the agent you already have. It cannot check tool calls or sandbox a case. Add it with `arc-skill-eval install-skills --skill arc-evals-lite`, or copy its one file by hand as [skills/README.md](skills/README.md) shows.

## Other ways to read results

- The terminal browser is `arc-skill-eval browse`. The [keymap](https://andysolomon.github.io/arc-skill-eval/keymap/) lists its keys.
- The web app at [arc-skill-eval.vercel.app](https://arc-skill-eval.vercel.app) reviews a run you import, drafts a suite, and has a guide to skill evals. It stores its data in your browser.
- `run --laminar` sends scores to [Laminar](https://www.lmnr.ai/).

## Develop

```bash
npm install
npm test                        # builds, then runs tests/*.test.mjs
npm --prefix web run test:e2e   # Playwright tests for the web app
npm run docs:dev                # docs site on localhost
```

## Credits

The grading method follows OpenAI's [Testing Agent Skills Systematically with Evals](https://developers.openai.com/blog/eval-skills). The file formats are Anthropic's. [Inspiration](https://andysolomon.github.io/arc-skill-eval/inspiration/) lists the rest.

## License

MIT
