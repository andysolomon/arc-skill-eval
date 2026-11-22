# Skills bundled with `arc-skill-eval`

This directory ships alongside the npm package. Each skill is a Claude Code / agentskills.io-compatible `SKILL.md` folder that complements the `arc-skill-eval` framework.

## Installing one into your project

The quickest way is `install-skills`. It copies `arc-creating-evals` and `arc-running-evals` into `.agents/skills/` (Pi, Codex, Cursor Agent, Copilot) and `.claude/skills/` (Claude Code) under the current directory:

```bash
arc-skill-eval install-skills
arc-skill-eval install-skills --harness claude-code --target ../my-project
arc-skill-eval install-skills --force    # replace an earlier install
```

Installed copies leave out each skill's `evals/` folder.

**No CLI?** `arc-evals-lite` needs only its `SKILL.md`:

```bash
mkdir -p .claude/skills/arc-evals-lite    # or .agents/skills/arc-evals-lite for Pi, Codex, Cursor, Copilot
curl -fsSL https://raw.githubusercontent.com/andysolomon/arc-skill-eval/main/skills/arc-evals-lite/SKILL.md \
  -o .claude/skills/arc-evals-lite/SKILL.md
```

It isn't installed by default, because next to the CLI-backed skills it would compete for "run the evals". Add it with `install-skills --skill arc-evals-lite` if you want it anyway. To install by hand instead, copy or symlink a skill folder into your agent's skills directory, such as `.claude/skills/` (project-scoped) or `~/.claude/skills/` (user-scoped):

```bash
# project-scoped
mkdir -p .claude/skills
ln -s "$(pwd)/node_modules/arc-skill-eval/skills/arc-creating-evals" .claude/skills/arc-creating-evals
```

```bash
# user-scoped
ln -s "$(pwd)/node_modules/arc-skill-eval/skills/arc-creating-evals" ~/.claude/skills/arc-creating-evals
```

## Bundled skills

- **`arc-creating-evals`** — interview-style skill that authors an `evals/evals.json` test suite for an existing skill. Follows the Anthropic skill-eval methodology. See `arc-creating-evals/SKILL.md`.
- **`arc-evals-lite`**: writes and runs evals with no CLI, using the agent you already have. Each case runs in a fresh sub-agent or headless agent CLI, and lite refuses to run in a harness that can't start one rather than grade its own answers. It checks files, regexes, JSON, and judge assertions, writes results in the CLI's `evals-runs/` layout, and skips tool-call checks, saying they need the CLI. Its evals use a fake `claude` binary in the `just-bash` sandbox to test both the refuse-without-isolation path and a full headless run. See `arc-evals-lite/SKILL.md`.
- **`arc-running-evals`**: runs an existing suite through the CLI's `--json` output, explains each failure (skill bug, eval bug, or environment problem), and drives review → improve → re-run. It asks before full-suite, `--compare`, or nested-harness runs, because each of those costs money. Its own evals run in the `just-bash` sandbox with a mocked `arc-skill-eval` binary, so they only cost the model calls. See `arc-running-evals/SKILL.md`.
- **`hello-world`** — deterministic reference skill + permanent smoke test. Writes `greeting.txt` in response to any "create a greeting" prompt. Ships with three eval cases demonstrating `file-exists`, file-targeted `regex-match`, assistant-text `regex-match`, and string (LLM-judged) assertions side-by-side. Use this as a worked example when authoring your own `evals/evals.json`, and as a cheap sanity check when debugging the framework:
   ```bash
   arc-skill-eval run "$(arc-skill-eval bundled hello-world)"
   ```

List bundled skills or resolve a path for shell substitution:

```bash
arc-skill-eval bundled
arc-skill-eval bundled hello-world
arc-skill-eval bundled --json
```

## Pilot skills (repo only)

Dogfood skills with full fixture trees live under `pilots/` and are not shipped in the npm tarball. See `docs/pilot/arc-conventional-commits.md` for the first P4 reference pilot.

## Authoring your own bundled skills

Follow the [agentskills.io specification](https://agentskills.io) for `SKILL.md` frontmatter. When your skill targets `arc-skill-eval` specifically, document the output format (`evals/evals.json` shape in `src/evals/types.ts`) and the CLI entry points (`arc-skill-eval run`, `arc-skill-eval validate`) it expects.
