# AGENTS.md

## Cursor Cloud specific instructions

`arc-skill-eval` is a TypeScript monorepo with several independently-runnable surfaces. Dependencies are installed automatically by the Cursor Cloud update script; the notes below cover only non-obvious run/test caveats. See `README.md`, `web/README.md`, and the `scripts` blocks in each `package.json` for standard commands.

### Layout / surfaces
- Root package `arc-skill-eval` — the Pi-native CLI + library (`src/`, entry `dist/bin/arc-skill-eval.js`). npm workspaces cover `packages/*` and `web`.
- `web/` — Vite/React SPA for authoring/reviewing evals.
- `web/daemon/` — companion Node daemon (port `7357`), **separate lockfile** (not part of the root workspace).
- `docs-site/` — Astro/Starlight docs site, **separate lockfile** (not part of the root workspace).
- `packages/tokens/` — shared design tokens; built on demand by the web `dev`/`build` scripts.

Because `web/daemon` and `docs-site` have their own `package-lock.json`, they need their own `npm install` (handled by the update script).

### Build / test / lint
- Build CLI: `npm run build` (tsc). Full check: `npm run test` (builds, then `node --test tests/*.test.mjs`).
- Two runtime tests fail by design unless the external `claude` and `cursor-agent` CLIs are on `PATH` (`assertRuntimeReady accepts claude-code…` / `…cursor-agent…`). These are environmental, not code failures. `tests/fixtures-materialize.test.mjs`'s setup-failure case is occasionally flaky under the full parallel run; it passes in isolation.
- Web e2e smoke: `npm --prefix web run test:e2e` (Playwright Chromium; browser is installed by the update script). It builds + serves a preview on port `4173` itself.
- Web build: `npm --prefix web run build` (runs `vite build`; this is the canonical web build).
- Web typecheck gotcha: `npm --prefix web run typecheck` reports 3 pre-existing type errors (`import.meta.env`, `IDBOpenDBRequest.oldVersion`). The CI `typecheck web` step (`npm --prefix web exec -- tsc --noEmit`) is green only because, with CWD at the repo root, it resolves the **root** `tsconfig.json` and typechecks the CLI instead of the web `src`. Do not treat web-typecheck errors as regressions you introduced.
- Docs: `npm run docs:build` builds the Astro site.

### Running services
- Web dev: `npm --prefix web run dev` starts the daemon (`http://127.0.0.1:7357`) **and** Vite (`http://127.0.0.1:5173`) together. `npm --prefix web run daemon` starts only the daemon. Vite binds `127.0.0.1`.
- CLI eval execution (`arc-skill-eval run`, `create --guided`, `optimize-description`, etc.) requires Pi configured with a provider API key (Anthropic/OpenAI/etc.). Commands that need no key: `--help`, `bundled`, `audit`, `create --dry-run`, `emit`.
