# ADR-0008: Web app on Foldkit; Effect for core run lifecycle

## Status

Accepted (2026-11-22). Supersedes the React part of [ADR-0002](./ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md); its Vite + TypeScript + token-mapped CSS decisions stand. Tailwind ([ADR-0006](./ADR-0006-tailwind-datatheme-integration.md)) was already unused in `web/src` and is dropped.

## Context

The React app grew per-section hooks that each re-implemented loading, error, persistence hydration and daemon calls with `useEffect`. That produced timing bugs the E2E suite had to work around: saved state applied a moment after first render (early input lost), section/theme preference writes that re-read and bounced between values, a Learn chapter saved only after a 150 ms debounce.

Separately, the CLI's case lifecycle (temp workspaces, staged skills, harness child processes) had no timeouts or cancellation and leaked temp directories on several failure paths.

Both problems are resource and effect management. [Effect](https://effect.website) addresses them directly, and [Foldkit](https://foldkit.dev) brings the same Effect model to the browser with the Elm architecture: one Schema-typed Model, fact-named Messages, a pure update, and side effects only as Commands and Subscriptions.

## Decision

1. **Core (`src/`):** adopt Effect 4.1 for the case lifecycle only: an interruptible child-process helper (`src/effect/process.ts`), scoped acquire/release for workspaces, runtime runs and staged skills (`src/effect/scope.ts`), `run --case-timeout`, and graceful Ctrl-C. Public APIs stay Promise-based.
2. **Web (`web/`):** replace React with Foldkit on Vite 8 (required by `@foldkit/vite-plugin`, which supplies view identity for the virtual-DOM differ). Each section is a Submodel behind one page contract (`web/AGENTS.md`); saved preferences load as Foldkit Flags before the first render.
3. Pin `effect` to one 4.1.x version across the workspace (Foldkit peers on `effect ~4.1.0`).
4. Do not vendor the Foldkit repository as a subtree; reference examples come from the `create-foldkit-app` npm package.

## Consequences

- **Positive:** the React-era load/persist timing bugs disappear by construction; every side effect is a named Command whose failure becomes a Message.
- **Positive:** one effect model across CLI and web, so the team learns Effect once.
- **Negative:** Foldkit is beta; breaking changes can land in minor releases. Pin exact versions and upgrade deliberately (see `web/FOLDKIT.md`).
- **Negative:** Effect and the Elm architecture are new to most contributors; views are function calls (`h.div([...], [...])`) instead of JSX.
- **Neutral:** visuals are unchanged: inline styles were ported 1:1 through `web/src/ui/sx.ts`, and the Playwright suite pins behavior through `data-testid`s.

## References

- [web/AGENTS.md](../../web/AGENTS.md), [web/FOLDKIT.md](../../web/FOLDKIT.md)
- [ADR-0002](./ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md)
