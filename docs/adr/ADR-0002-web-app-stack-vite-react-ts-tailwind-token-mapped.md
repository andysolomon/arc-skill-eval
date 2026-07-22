# ADR-0002: Web app stack — Vite + React + TS, Tailwind-mapped design tokens

## Status

Accepted (2026-07-21)

## Context

The design handoff at `docs/Arc skill eval web design/design_handoff_arc_skill_eval/`
delivers a five-section (`run / browse / create / review / learn`) hosted web app with
three theme variants. The handoff is framework-agnostic: "if no environment exists yet,
choose the most appropriate framework and implement there". The destination for this
effort is a **spec/dev-handoff**, not an implementation, so the stack must be locked
before the section specs are authored — every component spec is downstream of how the
design tokens become runnable CSS.

Constraints considered:

- **Token fidelity** — `design.md` defines 50+ semantic tokens across three themes. The
  chosen CSS layer must let components consume the semantic role (`--tt-blue`,
  `--tt-comment`, …) rather than retyping hex per element.
- **Theme switching** — The three themes share layout; switching is an attribute, not a
  remount. The CSS layer must support a single `[data-theme="<name>"]` selector swap.
- **Coexistence with the Ink TUI** — the existing `src/tui/` already encodes the same
  design language. A path that lets both surfaces consume one source of truth for tokens
  is preferred (see ADR-0003).
- **Deployment fit** — Destination locked at serverless (Vercel / Cloudflare Workers),
  no long-running container. The build target should produce a static SPA bundle.
- **Repo language alignment** — The repo is TypeScript-strict, ESM, Node ≥ 20, with
  `react-jsx` JSX already enabled in `tsconfig.json` (TUI files import React JSX today).

## Considered Options

- **A. Vite + React 18 + TypeScript** *(chosen)* — Vite ships a static SPA bundle that
  deploys trivially to any serverless platform. Tailwind config maps the design tokens
  directly into a theme. Zustand fits the single-state-tree model the handoff describes
  (`section`, `env`, `theme`, run lifecycle, etc.).
- **B. Next.js + TypeScript** — Adds SSR for free, which is attractive for hosting a
  `learn/` chapter series, but the handoff explicitly renders localhost state in the
  browser, and the spec destination defers auth and persistence to IndexedDB — neither
  needs SSR. Server components don't earn their complexity here.
- **C. Astro + React islands** — Strong for static-content-heavy sites; well-matched to
  the `learn/` chapter series as MDX, but the `run` / `create` / `review` sections are
  heavy interactive React. Wrapping each interaction in an island adds friction without a
  payoff for the localhost mode.
- **D. SvelteKit** — Smaller bundles, more cohesive, but off the beaten path for this
  repo's TS/Node idioms and harder to share components with the Ink TUI in the future.

## Decision

**Option A: Vite + React 18 + TypeScript (strict).**

1. **Build target** — `vite build` → `web/dist/` SPA bundle. Deployed to Vercel (or
   Cloudflare Pages) as static assets with a thin serverless function only if a future
   ticket surfaces the need.
2. **Styling** — Tailwind v4 with the `@theme` directive consuming tokens from the
   `@arc-skill-eval/tokens` package. `[data-theme="tokyonight|gruvbox|nord"]` on `<html>`
   swaps the active theme via the standard `data-` selector. Raw tokens still exposed as
   CSS custom properties for inline-glyph usages that escape utility classes.
3. **State** — Zustand for app-level state. One store matching the prototype's
   single-state-tree model: `section`, `env`, `theme`, `workspace` + picker open,
   run composer + lifecycle, browse selection, create wizard state, review feedback,
   learn page index, import state.
4. **Routing** — React Router with `/`, `/run`, `/browse`, `/create`, `/review`,
   `/learn`. The header keyboard shortcut `1`–`5` is a thin wrapper over the route
   change + state sync.
5. **Repo placement** — New sibling `web/` directory alongside `docs-site/` and `src/`.
   `tsconfig.json` for the web app is a separate `web/tsconfig.json`; the root
   `tsconfig.json` is unchanged.

## Consequences

- **Positive** — Vite + Tailwind + React is a heavily-trodden stack with low-risk
  implementer onboarding. Token mapping via Tailwind's `@theme` keeps components free of
  raw hex per the design handoff.
- **Positive** — Static SPA deployment keeps `hosted` mode serverless-cheap; Vercel's
  preview deployments make section-spec PRs reviewable without infra work.
- **Positive** — Coexists with the Ink TUI without forcing a shared component layer. The
  shared boundary is one package (`@arc-skill-eval/tokens`) and that contract is owned
  by ADR-0003.
- **Negative** — Routing the URL bar to actual section anchors (deep-linkable
  `/review/<runId>`) is a future ergonomics layer, not in this ADR's scope. Section
  state and route state will need a sync convention; deferred to a future ticket.
- **Negative** — Tailwind v4's `@theme` directive is the integration story; if v4
  surfaces a regression we will pin v3 in a follow-up ADR rather than abandon the
  token-mapped approach.
- **Neutral** — Zustand vs Redux vs Jotai is a low-stakes choice at this scale; the
  prototype's state shape is the real contract, not the store library.

## References

- `docs/Arc skill eval web design/design_handoff_arc_skill_eval/README.md`
- `docs/Arc skill eval web design/design_handoff_arc_skill_eval/design.md`
- ADR-0003 (shared tokens package)
- ADR-0004 (no-auth single-user hosted)
