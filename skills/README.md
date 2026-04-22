# Skills bundled with `arc-skill-eval`

This directory ships alongside the npm package. Each skill is a Claude Code / agentskills.io-compatible `SKILL.md` folder that complements the `arc-skill-eval` framework.

## Installing one into your project

Skills are discovered by most agent tools under `.claude/skills/` (project-scoped) or `~/.claude/skills/` (user-scoped). Pick one and either copy or symlink:

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

## Authoring your own bundled skills

Follow the [agentskills.io specification](https://agentskills.io) for `SKILL.md` frontmatter. When your skill targets `arc-skill-eval` specifically, document the output format (`evals/evals.json` shape in `src/evals/types.ts`) and the CLI entry points (`arc-skill-eval run`, `arc-skill-eval validate`) it expects.
