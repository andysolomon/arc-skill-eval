# Context Map

This repository holds three bounded contexts. Each has its own glossary and (where needed)
its own ADR folder. New work that changes domain meaning belongs in *one* context — pick the
right one before introducing terms.

## Contexts

- [Runtime](./docs/domain-model.md) — Pi SDK + Anthropic-standard `evals/evals.json`
  orchestration. The CLI (`arc-skill-eval run`) and the Ink TUI surface live here.
  *(No `CONTEXT.md` glossary yet — `docs/domain-model.md` is its domain-doc; a glossary can
  be extracted later if/when terms proliferate.)*
- [Audio Narration](./UBIQUITOUS_LANGUAGE.md) — Browser-native article reader using the
  Web Speech API. **Dormant** effort from an earlier repo state; glossary retained for
  history.
- [Web App](./docs/web-app/CONTEXT.md) — The Vite + React hosted web app designed in
  `docs/Arc skill eval web design/design_handoff_arc_skill_eval/`. Source of truth for
  design tokens, section vocabulary, and the implementation handoff.

## Relationships

- **Runtime → Web App**: Web App *reads* the artifacts Runtime writes (`evals-runs/` layout,
  `grading.json`, `benchmark.json`, `feedback.json`). Both share design tokens via the
  [`@arc-skill-eval/tokens`](https://github.com/andysolomon/arc-skill-eval/issues) package
  *(see ADR-0003 once it lands)*.
- **Web App → Runtime** *(localhost mode only)*: A future CLI handshake may let the Web App
  invoke the Runtime directly for `run` so localhost evaluations do not need a separate
  terminal session. Not in current scope; future ticket.
- **Runtime ↔ Audio Narration**: none. The audio narration effort is dormant and unrelated
  to either Runtime or Web App.
- **Web App ↔ Audio Narration**: none. The Web App renders docs pages authored as static
  MDX and does not share UI chrome with the dormant Article Reader.

## Editing discipline

- New domain terms go in **one** context's glossary only. If a term genuinely spans contexts
  (e.g. `Eval Suite`), define it in the producing context and reference it from consumers —
  do not duplicate definitions.
- Implementation choices (libraries, layouts, structure) never go in a glossary. They go in
  ADRs or in the relevant spec doc.
- If the destination of a new effort doesn't fit one of these three contexts, propose a
  fourth here first — don't smuggle it into an existing glossary.
