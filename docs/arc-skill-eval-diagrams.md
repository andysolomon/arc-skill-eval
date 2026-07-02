# arc-skill-eval diagrams

This folder contains Excalidraw source diagrams that explain how `arc-skill-eval` works and how to interpret its tags/labels.

## Diagrams

- [`diagrams/arc-skill-eval-pipeline.excalidraw`](diagrams/arc-skill-eval-pipeline.excalidraw) — end-to-end flow from `SKILL.md` + `evals/evals.json` through discovery, workspace setup, Pi execution, grading, artifacts, compare mode, and Laminar export.
- [`diagrams/arc-skill-eval-compare-observability.excalidraw`](diagrams/arc-skill-eval-compare-observability.excalidraw) — how `--compare` forks each case into `with_skill` and `without_skill`, then aggregates `benchmark.json` and optional Laminar traces.
- [`diagrams/arc-skill-eval-schema-and-tags.excalidraw`](diagrams/arc-skill-eval-schema-and-tags.excalidraw) — the `evals.json` case shape, eval metadata tags, difficulty values, intent examples, and assertion discriminator types.
- [`diagrams/arc-skill-eval-github-label-taxonomy.excalidraw`](diagrams/arc-skill-eval-github-label-taxonomy.excalidraw) — the repository's current GitHub issue/PR labels grouped by default workflow, priority, size, bug triage, and epic.

## Eval metadata tags shown

These are metadata tags currently generated or recognized by repo workflows. They are authoring/reporting metadata; the runner validates `metadata.tags` as an array of strings but does not alter grading semantics based on tag values.

- Scenario tags: `trigger`, `execution`, `routing`
- Polarity tags: `positive`, `negative`, `golden-path`
- Origin tags: `starter`, `guided`
- Lifecycle/status tag: `needs-eval-improvement`
- Difficulty values: `easy`, `medium`, `hard`
- Common intent values: `explicit-trigger`, `representative-execution`, `adjacent-negative`

## GitHub labels shown

The label taxonomy diagram includes all labels currently configured in this GitHub repo:

- Defaults: `bug`, `documentation`, `duplicate`, `enhancement`, `good first issue`, `help wanted`, `invalid`, `question`, `wontfix`
- Priorities: `priority:P0`, `priority:P1`, `priority:P2`
- Sizes: `size:S`, `size:M`, `size:L`
- Bug triage: `type:bug`, `severity:S3`, `area:runtime`, `area:tui`
- Epics: `epic:observability`, `epic:docs`, `epic:docs-site`, `epic:dogfood`, `epic:roadmap`, `epic:runtime`, `epic:llm-guided-create`, `epic:safe-eval-sandboxing`, `epic:eval-quality`, `epic:tui-eval-review`

Recommended work-item labeling pattern: one epic + one priority + one size; add type/severity/area for bugs.
