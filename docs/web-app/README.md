# Arc Skill Eval web app documentation

This README indexes the specifications for the arc-skill-eval web app.
Read the linked documents in order before you implement a section. The
code lives in `web/`; [`web/README.md`](../../web/README.md) says how to
run it and [`web/AGENTS.md`](../../web/AGENTS.md) describes its layout.

## What this is

A five-section web app (`run` · `browse` · `create` · `review` ·
`learn`) that shows `arc-skill-eval`'s eval pipeline in a browser.
It does not replace the CLI or the Ink TUI. It shares design tokens
with both through the `@arc-skill-eval/tokens` workspace package.
Hosted mode runs in the browser alone; localhost mode talks to the
daemon in `web/daemon/`, which runs evals on your machine.

**Source of truth for layout and behavior** is the design prototype at
`docs/Arc skill eval web design/design_handoff_arc_skill_eval/arc-skill-eval-app.dc.html`.
**Source of truth for tokens** is `design.md` in the same handoff folder.
These documents and artifacts define the current web app behavior. If
a specification is ambiguous, file a follow-up issue instead of
choosing behavior without recording the decision.

## Read in this order

| # | Doc | Why |
|---|---|---|
| 1 | [Stack](../adr/ADR-0008-web-app-foldkit-and-effect.md) | What you build on: Vite, TypeScript, Foldkit and Effect. [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md) holds the earlier Vite and token decisions that still stand. |
| 2 | [Tokens package](../adr/ADR-0003-shared-arc-skill-eval-tokens-package.md) &middot; [contract](../adr/ADR-0005-tokens-package-contract.md) | Where the design tokens come from. The tokens package lives in `packages/tokens/`; the app reads its `dist/web-theme.css`, and `[data-theme]` on `<html>` swaps the theme. |
| 3 | [Hosted persistence](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) &middot; [IDB schema](./persistence-spec.md) | What stays in the browser, with hard contract. |
| 4 | [Glossary](./CONTEXT.md) | The vocabulary. Read it once and refer back as needed. |
| 5 | Decisions in `./decisions/` ([gating](./decisions/hosted-empty-state-gating.md), [workspace picker](./decisions/workspace-picker.md)) | Two structural decisions that affect every section. |
| 6 | Section specs in `docs/web-app/`: [`run`](./section-run.md), [`browse`](./section-browse.md), [`create`](./section-create.md), [`review`](./section-review.md), [`learn`](./section-learn.md) | One per App Section, in priority order (run is the flagship). |

Then open the specification for the section you are implementing.

## Repository layout

```
.
├── packages/tokens/                 # @arc-skill-eval/tokens workspace
│   ├── src/tokens.ts                # canonical typed palettes
│   ├── tailwind-theme.css.template  # template for the generated theme CSS
│   ├── scripts/build.mjs            # generator for dist/web-theme.css
│   └── dist/                        # gitignored; tsc and build.mjs emit it
├── web/                             # web app (Foldkit)
│   ├── src/                         # Model, Messages, update, views per section
│   ├── daemon/                      # localhost daemon (port 7357)
│   ├── tests/e2e/                   # Playwright suite
│   └── vite.config.ts
├── docs/web-app/                    # web app documentation
│   ├── README.md                    # this file
│   ├── CONTEXT.md                   # web app glossary
│   ├── persistence-spec.md
│   ├── decisions/
│   └── section-{run,browse,create,review,learn}.md
└── docs/adr/                        # repo-wide ADRs (0002 to 0006 and 0008 cover the web app)
```

## Conventions when implementing

- **Tokens only.** Views read `var(--tt-blue)` and the other token
  variables; raw hex never appears in a view. `packages/tokens/src/tokens.ts`
  is the single place to change a color.
- **Three themes, one layout.** The `[data-theme="…"]` attribute on
  `<html>` swaps themes through the generated CSS; nothing remounts.
- **Three states per section.** `idle | running | done` is
  lifecycle-shaped (in `run`); `selected-unfocused | selected-focused | empty`
  is selection-shaped (in `browse` and `review`); `not-yet-authored | pristine | dirty | valid`
  is wizard-shaped (in `create`). State machines belong to the section
  spec and are not repeated elsewhere.
- **No silent writes.** Every write to the filesystem or IndexedDB goes
  through a gate the user clicks. Follow ADR-0004.
- **Hosted has no LLM.** The cyan callouts in `create` and the import
  cards in `run` and `review` express this. Do not add an LLM path to
  hosted mode.

## Verification

Run at least these checks:

- `npm --workspace @arc-skill-eval/tokens run build` emits
  `packages/tokens/dist/index.js` and `dist/web-theme.css` and exits 0.
- `npm --prefix web run typecheck` and `npm --prefix web run build`
  pass; the build emits `web/dist/`, a static bundle with no server.
- `npm --prefix web run test:e2e` passes. It starts its own daemon,
  so the localhost specs exercise the real daemon.
- The repository's test suite (`npm test`) still passes. Web app
  changes must not break the runtime.

## Open questions

These are tracked on the map at
[#163](https://github.com/andysolomon/arc-skill-eval/issues/163) under
"**Not yet specified**". Record any decision in a follow-up issue.

- `create` step 1 `generate starter evals` model picker (now the same
  as the run composer's `--model` field; documented in
  [`section-create.md`](./section-create.md)).
- Hosted LLM cost ceiling for `Σ $0.87`-style totals.
- Real-time collaboration on `review`.
- Trace visualizations in `browse`'s Trace tab (tool-call bar chart
  granularity).
- Cost-of-the-win and suite-pattern analysis features from `learn`
  chapter 5.
- Vision and contrast themes beyond tokyonight, gruvbox and nord.

## How to file a documentation correction

Open an issue with the `epic:web-app` label and name the section spec
file. The map at
[#163](https://github.com/andysolomon/arc-skill-eval/issues/163) tracks
which decisions have landed and which are still open.

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md) (React part superseded by ADR-0008)
- [ADR-0003](../adr/ADR-0003-shared-arc-skill-eval-tokens-package.md)
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md)
- [ADR-0005](../adr/ADR-0005-tokens-package-contract.md)
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md) (superseded by ADR-0008)
- [ADR-0008](../adr/ADR-0008-web-app-foldkit-and-effect.md)
- Section specs: [`run`](./section-run.md) · [`browse`](./section-browse.md) · [`create`](./section-create.md) · [`review`](./section-review.md) · [`learn`](./section-learn.md)
- Decisions: [`hosted-empty-state-gating`](./decisions/hosted-empty-state-gating.md) · [`workspace-picker`](./decisions/workspace-picker.md)
- Persistence: [`persistence-spec.md`](./persistence-spec.md)
- Glossary: [`CONTEXT.md`](./CONTEXT.md)
- Map: [#163](https://github.com/andysolomon/arc-skill-eval/issues/163)
- Design prototype and token source: `docs/Arc skill eval web design/design_handoff_arc_skill_eval/`
