# ADR-0005: `@arc-skill-eval/tokens` package contract — exports, build, versioning

## Status

Accepted (2026-07-22)

## Context

ADR-0003 locked `@arc-skill-eval/tokens` as a single internal workspace under
`packages/tokens/`. Issue #164 asks the remaining contract questions: export
shape for both consumers, who consumes what, build-script shape, Tailwind
template strategy, and how internal versioning avoids breaking the Ink TUI when
a web-only token is added.

Surfaces already named:

- **Ink TUI** — `src/tui/theme.ts` will import typed token objects from
  `@arc-skill-eval/tokens` (today it owns the palettes inline).
- **Web app** — Tailwind v4 `@theme` / CSS custom properties under the `--tt-`
  prefix, regenerated from the package (ADR-0002 / ADR-0003).

The open choice was: one package with two consumer entrypoints (Tailwind plugin
+ raw TS), one package the web *build script* consumes while the TUI imports TS
directly, or two separate packages.

## Decision

**One internal package; TUI imports TypeScript; web consumes a generated CSS
template via a build script — not a Tailwind plugin entrypoint, not two
packages.**

This is ADR-0003 Option A, narrowed into an explicit consumer contract.

### 1. Package shape (answers #164)

- **Chosen:** one workspace package `@arc-skill-eval/tokens` at `packages/tokens/`.
- **Rejected:** two packages (shared core + web-only) — doubles workspace and
  release-surface noise without isolating TUI better than typed exports already
  can.
- **Rejected:** shipping a Tailwind *plugin* as a second package entrypoint —
  the web app needs a generated `@theme` CSS artifact, not a runtime plugin
  dependency from the tokens leaf.

### 2. Export shape

| Export | Form | Consumer |
| --- | --- | --- |
| Semantic roles + per-theme palettes | Typed TypeScript objects (`tokens.ts` / package main) | Ink TUI via `src/tui/theme.ts` |
| Tailwind `@theme` block | Mustache-style `tailwind-theme.css.template` → generated `dist/web-theme.css` (**not committed**) | Web app Tailwind config / CSS pipeline |

- **TUI contract:** import only the typed palette/role objects. No CSS, no
  template, no Node fs at runtime.
- **Web contract:** never import the TS palettes into the browser bundle for
  theming; consume the generated CSS (and, if needed at build time, the same
  token source through the generator). Raw hex stays only in `tokens.ts`.

### 3. Build script shape

- Package script: `npm --workspace @arc-skill-eval/tokens run build` runs the
  template generator (tokens → `dist/web-theme.css`).
- Web `prebuild` / `predev` regenerate that CSS in place so design edits show up
  on save.
- CI hashes the generated file (or regenerates and diffs) so hand-edits of the
  CSS cannot drift from `tokens.ts`.
- Root `semantic-release` does **not** publish this package; it remains an
  internal leaf (`files` excludes dist artefacts).

### 4. Tailwind template strategy

- Source template: `tailwind-theme.css.template` (Mustache-style), wrapping
  token values into a Tailwind v4 `@theme { … }` block and exposing `--tt-*`
  custom properties for non-utility usages.
- Theme swap remains `[data-theme="tokyonight|gruvbox|nord"]` on `<html>`
  (ADR-0002); the generator emits all three palettes into the CSS artifact.
- Tailwind directive shape changes are one template/script edit, not per-
  component edits.

### 5. Internal versioning policy (TUI safety)

- Package version is internal `0.x.y`, bumped on design-language change. Not
  published to npm for external consumers.
- **Shared core** — roles already used by the TUI (semantic colors / palettes
  mirroring today's `src/tui/theme.ts`) live on the primary TS export. Renames
  or removals of shared roles are **breaking** (bump `0.MAJOR` within `0.x` or
  document a coordinated TUI + web PR).
- **Web-only tokens** (spacing, radii, type scale, shadows, extras beyond the
  TUI palette) live in an **additive** export or nested field that `theme.ts`
  does **not** import. Adding a web-only token is a **minor** bump and must not
  change the shared core type surface the TUI imports.
- TUI builds must keep typechecking against the shared core alone; web-only
  additions are invisible to that import path by construction.

## Consequences

- **Positive** — Clear ownership: TUI's `src/tui/theme.ts` imports from
  `@arc-skill-eval/tokens`; web's Tailwind config consumes the generated CSS
  template output. One question (#164) is closed for #165 / #166 / #169.
- **Positive** — Web-only token growth cannot break the Ink TUI import/type
  surface if additive exports stay off the TUI import path.
- **Positive** — Build/regen + CI hash keep the CSS artifact honest without
  committing generated files.
- **Negative** — Implementers must remember the two-layer export (shared vs
  web-only); a mistaken shared-core edit still couples both surfaces.
- **Neutral** — Package scaffold and schema extraction remain downstream
  (#165+); this ADR is documentation-only.

## References

- GitHub issue #164 — Lock the `@arc-skill-eval/tokens` package contract
- ADR-0003 — Shared `@arc-skill-eval/tokens` package (workspace shape)
- ADR-0002 — Web app stack (Vite / Tailwind / `[data-theme]`)
- `src/tui/theme.ts` — current TUI token source (future import site)
- `docs/web-app/CONTEXT.md` — web surface vocabulary
