# Arc Skill Eval — Web App Dev Handoff

> **You are here.** An implementer opening this README has been handed
> the complete spec/handoff for the Vite + React hosted web app
> version of `arc-skill-eval`. Below is the entry point — read this
> file end to end, then follow the linked specs in the order they
> appear.

## What this is

A five-section hosted web app (`run` · `browse` · `create` · `review` ·
`learn`) that surfaces `arc-skill-eval`'s eval pipeline in a browser.
It does not replace the CLI or the Ink TUI — it provides a hosted
companion, sharing design tokens with both via the
`@arc-skill-eval/tokens` workspace package.

**Source of truth for layout & behavior** is the design prototype at
`docs/Arc skill eval web design/design_handoff_arc_skill_eval/arc-skill-eval-app.dc.html`.
**Source of truth for tokens** is `design.md` in the same handoff dir.
This handoff docs + those two artifacts are the complete spec — there
is nothing further to infer.

## The destination

A future implementer can build the full web app from these docs with
no further questions answered. If a spec is ambiguous, the spec is
**wrong** — file a follow-up issue, do not invent the answer.

## Read in this order

| # | Doc | Why |
|---|---|---|
| 1 | [Stack](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md) | What you're building on (Vite + React + TS + Tailwind v4). |
| 2 | [Tokens package](../adr/ADR-0003-shared-arc-skill-eval-tokens-package.md) &middot; [contract](../adr/ADR-0005-tokens-package-contract.md) &middot; [Tailwind integration](../adr/ADR-0006-tailwind-datatheme-integration.md) | Where the design tokens come from; how the theme swap works. The tokens package itself lives in `packages/tokens/`; the consumer reads `dist/web-theme.css`. |
| 3 | [Hosted persistence](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) &middot; [IDB schema](./persistence-spec.md) | What stays in the browser, with hard contract. |
| 4 | [Glossary](./CONTEXT.md) | The vocabulary — read once, refer back as needed. |
| 5 | Decisions in `./decisions/` ([gating](./decisions/hosted-empty-state-gating.md), [workspace picker](./decisions/workspace-picker.md)) | Two structural decisions that affect every section. |
| 6 | Section specs in `docs/web-app/`: [`run`](./section-run.md), [`browse`](./section-browse.md), [`create`](./section-create.md), [`review`](./section-review.md), [`learn`](./section-learn.md) | One per App Section, in priority order (run is flagship). |

After reading, jump straight to the section you are about to implement.

## Repo layout (as the implementer will see it)

```
.
├── packages/tokens/                                # @arc-skill-eval/tokens workspace
│   ├── src/tokens.ts                               # canonical typed palettes
│   ├── tailwind-theme.css.template                 # Mustache-style @theme template
│   ├── scripts/build.mjs                           # dep-free generator
│   └── dist/web-theme.css                          # gitignored; emitted by build
├── web/                                            # TBD — implementer scaffolds here
│   ├── src/
│   ├── public/
│   ├── vite.config.ts
│   └── tsconfig.json
├── docs/web-app/                                   # ← you are here
│   ├── README.md                                   # this file
│   ├── CONTEXT.md                                  # web-app glossary
│   ├── persistence-spec.md
│   ├── decisions/
│   │   ├── hosted-empty-state-gating.md
│   │   └── workspace-picker.md
│   └── section-{run,browse,create,review,learn}.md
├── docs/adr/                                       # repo-wide ADRs (this handoff includes 0002-0006)
└── docs/Arc skill eval web design/design_handoff_arc_skill_eval/
    ├── arc-skill-eval-app.dc.html                  # prototype (open in browser)
    ├── design.md                                   # design tokens
    └── README.md                                   # handoff brief
```

## Conventions when implementing

- **Tokens only.** Components read `var(--tt-blue)` etc.; raw hex is
  never in components. The `packages/tokens/src/tokens.ts` is the
  single edit point for any color change.
- **Three themes, one layout.** The `[data-theme="…"]` attribute on
  `<html>` swaps themes via the generated CSS; never remount.
- **Three states per section.** `idle | running | done` is
  lifecycle-shaped (in `run`); `selected-unfocused | selected-focused | empty`
  is selection-shaped (in `browse`/`review`); `not-yet-authored | pristine | dirty | valid`
  is wizard-shaped (in `create`). State machines belong to the section
  spec, not duplicated elsewhere.
- **No silent writes.** Anything that touches the filesystem or
  IndexedDB goes through a user-clicked gate and surfaces a status-bar
  toast. ADR-0004 is the law.
- **Hosted has no LLM.** The cyan callouts in `create` and the import
  cards in `run`/`review` are the expression of this. Do not
  introduce an LLM path on hosted.

## Verification you can run

A full verification suite belongs to the implementer, but the
following short checks are the floor:

- `npm --workspace @arc-skill-eval/tokens run build` → emits
  `packages/tokens/dist/web-theme.css` and exits 0.
- `node -e "console.log(require('@arc-skill-eval/tokens').themes.tokyonight.bg)"`
  → prints `#1a1b26`.
- A future `npm --prefix web run build` (not yet wired) emits
  `web/dist/`. The static bundle deploys to Vercel or Cloudflare
  Pages with no server.
- The repo's existing test suite at `tests/*.test.mjs` continues to
  pass — web-app changes must not break the Runtime.

## Open questions (graduated from the chart)

These are tracked on the map at
[#163](https://github.com/andysolomon/arc-skill-eval/issues/163) under
"**Not yet specified**". The implementer should *not* decide these
silently — surface them in a follow-up issue.

- `create` step 1 `generate starter evals` model picker (now the same
  as the run composer's `--model` field; documented in
  [`section-create.md`](./section-create.md)).
- Hosted LLM cost ceiling for `Σ $0.87`-style totals.
- Real-time collaboration on `review`.
- Trace visualizations in `browse`'s Trace tab (tool-call bar chart
  granularity).
- Cost-of-the-win and suite-pattern analysis features from `learn`
  chapter 5.
- Vision / contrast themes beyond tokyonight / gruvbox / nord.

## How to file a handoff correction

Open an issue with the `epic:web-app` label and reference the section
spec filename. The chart session's map at
[#163](https://github.com/andysolomon/arc-skill-eval/issues/163) tracks
which decisions have landed and which are still open.

## Cross-references

- [ADR-0002](../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md)
- [ADR-0003](../adr/ADR-0003-shared-arc-skill-eval-tokens-package.md)
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md)
- [ADR-0005](../adr/ADR-0005-tokens-package-contract.md)
- [ADR-0006](../adr/ADR-0006-tailwind-datatheme-integration.md)
- Section specs: [`run`](./section-run.md) · [`browse`](./section-browse.md) · [`create`](./section-create.md) · [`review`](./section-review.md) · [`learn`](./section-learn.md)
- Decisions: [`hosted-empty-state-gating`](./decisions/hosted-empty-state-gating.md) · [`workspace-picker`](./decisions/workspace-picker.md)
- Persistence: [`persistence-spec.md`](./persistence-spec.md)
- Glossary: [`CONTEXT.md`](./CONTEXT.md)
- Map: [#163](https://github.com/andysolomon/arc-skill-eval/issues/163)
- Design prototype & token source: `docs/Arc skill eval web design/design_handoff_arc_skill_eval/`
