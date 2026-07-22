# ADR-0003: Shared `@arc-skill-eval/tokens` package — one source of truth for design tokens

## Status

Accepted (2026-07-21)

## Context

The Ink TUI at `src/tui/theme.ts` already encodes the design language — semantic color
roles (`bg`, `fg`, `comment`, `border`, `blue`, `cyan`, `green`, `orange`, `red`,
`yellow`, `magenta`, `teal`) and per-theme palettes (tokyonight default, gruvbox,
nord). The web app handoff at
`docs/Arc skill eval web design/design_handoff_arc_skill_eval/design.md` defines the
same vocabulary with the `--tt-` prefix. Without a shared source, the two surfaces
will drift the moment the design language evolves, and any "match the TUI in the web
app" claim becomes a per-section alignment ritual.

Constraints considered:

- **Tooling mismatch** — the TUI consumes tokens as TypeScript literals; the web app
  consumes them via Tailwind's `@theme` directive or raw CSS custom properties. A single
  package must serve both, not two parallel ones.
- **TypeScript-strictness** — `tsconfig.json` is strict (`noUncheckedIndexedAccess`,
  `forceConsistentCasingInFileNames`, ESM `NodeNext`). A new package must compile
  under the same rules without forcing the root config to include it.
- **Build coupling** — the root package is consumed by `semantic-release`; the new
  tokens package is a leaf, not a published artifact for this release. Internal
  workspaces must not destabilize the release pipeline.

## Considered Options

- **A. Internal workspace `@arc-skill-eval/tokens` consumed by both TUI and web**
  *(chosen)* — A small package exporting the three theme palettes as TS objects plus a
  script that generates the Tailwind `@theme` block for the web app. TUI imports TS
  directly; web consumes the generated CSS via a build step.
- **B. Duplicate tokens, keep in sync manually** — Faster to ship, but the drift cost
  is paid on every design change. Rejected: design tokens evolve frequently enough
  that the manual-sync burden exceeds the package-extraction cost.
- **C. Single CSS file with custom properties, consumed by both** — Works for the web,
  but the Ink TUI cannot read CSS custom properties at runtime without a build-time
  codegen step. Punted to a future-only option if both surfaces converge on a CSS
  pipeline.

## Decision

**Option A: an internal workspace package `@arc-skill-eval/tokens`.**

1. **Location** — `packages/tokens/` at the repo root, sibling to `src/`, `docs/`,
   `docs-site/`, `web/`. *(Path picked because placing it under `src/` would force the
   root `tsconfig.json` to broaden its `include`; placing it under `web/` would invert
   the dependency direction — web depends on tokens, not the other way around.)*
2. **Exports** —
   - `tokens.ts` — semantic color roles + per-theme palette values as a typed object.
     Consumed by `src/tui/theme.ts`.
   - `tailwind-theme.css.template` — Mustache-style template that wraps the token
     values into a Tailwind v4 `@theme { … }` block.
   - `dist/web-theme.css` — Generated output. **(Not committed.)** The web app's
     `npm run prebuild` regenerates this file from the template; CI verifies the
     generated file matches a recorded hash so drift doesn't slip through.
3. **Versioning** — Internal `0.x.y`, bumped per design-language change. No public
   release; `files` in `package.json` excludes the dist artefacts from publication.
4. **Source of truth** — `tokens.ts` is the *only* place a hex value or a role name
   changes. The web app's Tailwind config and the TUI's `theme.ts` both read from
   here. Raw hex values in `design.md` are reference, not edit-points — they are
   copy/pasted into `tokens.ts` on design changes, never edited downstream.
5. **Tooling** — Workspace added to root `package.json` via `"workspaces": ["packages/*"]`.
   Build script `npm --workspace @arc-skill-eval/tokens run build` runs the template
   generator. Web app's `prebuild` and `predev` hooks regenerate the CSS in-place so
   design changes are picked up on save.

## Consequences

- **Positive** — One place to update a token. Drift is impossible by construction; the
  CI hash check catches accidental retyping.
- **Positive** — Tailwind's `@theme` directive is generated, not hand-maintained, so
  any future Tailwind version bump that changes the directive shape is one script
  edit, not N component edits.
- **Positive** — TUI tokens live next to their TS usages; no `node_modules` boundary
  inside the TUI build.
- **Negative** — The package-extraction adds a small build step. Web's cold-start
  dev server is slightly slower until the generator caches. Acceptable.
- **Negative** — Drift from `design.md` (the prose spec) is still possible: someone
  could edit `design.md` without updating `tokens.ts`. Mitigated by Ticket 2 in the
  Web App wayfinding map, which graduates that verification into a check.
- **Neutral** — Nothing in this ADR touches the audio-narration glossary; that context
  has its own design tokens and remains out of scope.

## References

- `src/tui/theme.ts` *(current TUI token source, to import from `@arc-skill-eval/tokens`)*
- `docs/Arc skill eval web design/design_handoff_arc_skill_eval/design.md`
- ADR-0002 (web app stack — Vite/Tailwind/React)
