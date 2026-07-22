# Implementation Map — Arc Skill Eval web app

> **What this is.** A ticket-by-ticket plan that turns the spec at
> `docs/web-app/` into a deployable web app. Companion to the
> **Spec Map** at [#163](https://github.com/andysolomon/arc-skill-eval/issues/163)
> (which delivered the spec) and tracks under epic
> `epic:web-app` / `area:web-app` / `wayfinder:task`. Map issue:
> [#188](https://github.com/andysolomon/arc-skill-eval/issues/188).

## Destination (locked)

A **functional, hosted web app** that:
- boots in `npm --prefix web run dev` and renders in the browser;
- ships themes × envs × sections through `run / browse / create / review / learn`;
- persists local state via IndexedDB (no backend) per the
  [`persistence-spec.md`](./persistence-spec.md);
- pairs with a CLI companion daemon (localhost mode) that exposes
  `POST /runs`, `POST /apply-plan`, `POST /generate-evals` per the
  [`workspace-picker.md`](./decisions/workspace-picker.md) decision.

## Stack (locked)

- **Build**: Vite + React 18 + TypeScript (strict) per ADR-0002.
- **Styles**: Tailwind v4 + the generated `@arc-skill-eval/tokens` CSS
  per ADR-0006; `[data-theme]` swap on `<html>`.
- **State**: small (Zustand-free) React context + reducer pattern,
  persisted to IndexedDB; one global env toggle.
- **Content**: MDX in `docs/web-app/learn/` for the `learn` section.
- **Deploy**: Vercel (or Cloudflare Pages) — serverless.

## Conventions when implementing

- The five App Sections render in exactly one **Env Variant**
  (`localhost` | `hosted`) and one **Theme Variant**
  (`tokyonight` | `gruvbox` | `nord`) at a time.
- `localhost` mode unlocks LLM helpers (`generate starter evals`,
  `✦ suggest`, etc.); `hosted` shows cyan explainer callouts instead.
- Every ticket ships a **PR with passing `npm --prefix web run build`
  + `tsc --noEmit`**. No PR with red CI merges.
- Components read CSS variables (`var(--tt-blue)`); raw hex is never
  embedded in `web/`. The `packages/tokens/` typed token objects are
  the single edit point.
- No silent writes. Anything that touches the filesystem or IndexedDB
  goes through a user-clicked gate and surfaces a status-bar toast.
- The CLI companion daemon (localhost) is the only web app ↔ host
  channel. No direct FS access from the browser.
- Branch convention: `feat/issue-<N>-<slug>` (no W-IDs on these).
- Conventional commit types: `feat:`, `feat(scope):`, `fix:`,
  `chore:`, `docs:` (for any ADR updates).

## Tickets

14 tickets total, ordered so each one ships as a standalone PR whose
merge unblocks the next. Dependency arrows: `→` = "must land before".

### Phase 1 — Foundation (3 tickets)

1. **#189 — Scaffold `web/` + tokens wire-up + theme swap** *(this
   session's first delivery)*. The tracer bullet. `npm run dev` boots
   and renders the global chrome with the theme picker working.
   Establishes: Vite + React 18 + TS strict + Tailwind v4 + the
   `@arc-skill-eval/tokens` CSS import; the `[data-theme]` swap on
   `<html>`; the section nav (1–5) and status bar. ~12 files in
   `web/`; root `package.json` `workspaces` already in place.

   Files: `web/{package.json, vite.config.ts, tsconfig.json,
   tsconfig.node.json, index.html, src/main.tsx, src/App.tsx,
   src/styles.css, src/theme/useTheme.ts, src/theme/ThemeProvider.tsx,
   src/components/GlobalHeader.tsx, src/components/SectionNav.tsx,
   src/components/StatusBar.tsx}`.
   No app-section code yet.
   Verification: `npm --prefix web install && npm --prefix web run build && npm --prefix web run dev` → `http://localhost:5173/` renders the chrome with `tokyonight` and `data-theme="tokyonight"` swapped to `gruvbox` on click.

   → #190, #191

2. **#190 — UI state persistence (theme, env, prefs) via IndexedDB**.
   Wires the four stores from
   [`persistence-spec.md`](./persistence-spec.md): `preferences`,
   `feedback`, `improvePlans`, `learnProgress`. Includes `schemaVersion`
   + `migrate()` scaffolding, `Reset hosted data` in the status bar,
   and the env toggle (hidden on localhost; effective on hosted).
   Depends on #189 (no chrome without it).

   → #192, #196, #197 (daemon reads prefs)

3. **#191 — Section primitives library**. Implements the
   visual/structural pieces sections share: `Column`, `Kicker`,
   `EmptyState`, `RunCard`, `CaseCard`, `ComposerRow`, `ImportCard`,
   `StepRail`. Storybook-less; tested via the first section that
   uses them (#192). Depends on #189.

   → #192, #193, #194, #195

### Phase 2 — Hosted variants of all 5 sections (5 tickets)

The hosted variant is structurally simpler than localhost per
ADR-0004 (no LLM, no filesystem). It's built first and the localhost
variant is layered on top in Phase 3.

4. **#192 — `review` section, hosted**. Three-column Runs / Summary /
   Feedback+Improve; hosts an Import Card when no data; records
   feedback notes to the IDB `feedback` store. No `--apply` yet (deferred to #200). Depends on #190, #191.

   → #193, #194, #195, #200

5. **#193 — `browse` section, hosted**. Three-pane Runs Rail / Case
   List / Detail Pane; mode tabs (Overview, Response, Diff, Trace,
   Raw) with the per-tab artifact rendering surface; Empty State
   Hero when no imports. Depends on #191.

   → #194, #200

6. **#194 — `run` section, hosted**. Composer + Console two-panel
   surface (localhost variant replaces Composer with Import Card on
   hosted); empty-state Install Command Pill. Depends on #191.

   → #198 (localhost variant)

7. **#195 — `create` section, hosted**. 4-step wizard skeleton
   (behaviors → prompts → assertions → review); cyan callouts in
   place of green localhost hints; `write evals.json` button **downloads**
   `evals.json` only (no FS write on hosted). Depends on #191.

   → #199 (localhost variant)

8. **#196 — `learn` section, hosted + MDX runtime**. Renders
   `docs/web-app/learn/*.mdx` (7 chapters); stepwise nav; learn
   progress writes to the `learnProgress` IDB store. Depends on #190.

   *(Standalone; no follow-ups depend on it. Content authoring is
   part of #202.)*

### Phase 3 — Localhost mode + daemon (5 tickets)

9. **#197 — Workspace-picker CLI companion dev daemon**. A standalone
   Node process; exposes `POST /runs` (issue a run), `POST /apply-plan`
   (write an Improve Plan), `POST /generate-evals` (LLM starter call).
   Streams per-case progress via WebSocket. The web app's only
   localhost channel. Depends on #190 (env toggle), #191 (ResultCard).

   → #198, #199, #200

10. **#198 — `run` section, localhost**. Replaces the Import Card
    with the Composer + Console populated via the daemon. CLI command
    shows the run lifecycle state machine. Depends on #197.

    *(run is flagship; no other localhost variants depend on this one.)*

11. **#199 — `create` section, localhost**. Wires the
    `generate starter evals` LLM callout through the daemon; `write
    evals.json` writes through the workspace-picker CLI handshake
    (no auto-commit). Depends on #197.

    *(localhost-specific primitives live in #197.)*

12. **#200 — `review` section, localhost**. The only mutation-beyond-IDB
    in the app: `--apply` posts to the daemon with a separate `commit`
    gate per the spec's `--apply` semantics. Depends on #197.

13. **#201 — `browse` section, localhost**. Reads the daemon's
    `evals-runs/<id>/` tree as artifact source; locally hosted writes
    flow into the same IDB stores as #193. Depends on #197.

### Phase 4 — Ship (2 tickets)

14. **#202 — Author `learn` MDX content + responsive MDX theme.** Populate
    `docs/web-app/learn/` with the 7 chapters from
    [`section-learn.md`](./section-learn.md); verify
    sequencing + provenance footer + deep-dive links.

    Depends on #196.

15. **#203 — Production build + hosted deploy (Vercel) + Playwright
    smoke**. `npm --prefix web run build` produces `web/dist/`;
    repo ships a `vercel.json` exposing `web/` as the project root;
    a small Playwright smoke (`/run / browse / create / review /
    learn` reach + theme switch) passes in CI. Depends on #201.

    *(Final ticket. Closes the destination.)*

## Verification (ticket-level, every PR)

- `npm --prefix web run build` exits 0.
- `npx --prefix web tsc --noEmit` exits 0 with strict on.
- For section tickets: a storybook-less screenshot or a Playwright
  check is attached to the PR body, capturing the section's localhost
  variant render OR hosted variant render OR both (per the ticket).
- No silent writes introduced.
- No new raw hex colors anywhere in `web/`.

## Conventions for child tickets

When opening child tickets (see "Tickets" section above), each
ticket body must include:

- **Outcome** — the exact result the ticket must produce (≤1 sentence).
- **Scope** — files added/modified (paths under `web/` or `packages/`
  or `docs/web-app/` if spec edits are in-scope); no other files.
- **Verification** — the commands to run and the visual or
  data-state assertions to pass.
- **Preserved behavior** — what must remain working.
- **Blocked by** — parent ticket numbers.

## Cross-references

- Spec map: [#163](https://github.com/andysolomon/arc-skill-eval/issues/163)
- This map: [#188](https://github.com/andrewsolomon/arc-skill-eval/issues/188)
- Section specs: [`run`](./section-run.md) ·
  [`browse`](./section-browse.md) · [`create`](./section-create.md) ·
  [`review`](./section-review.md) ·
  [`learn`](./section-learn.md)
- Decisions: [`hosted-empty-state-gating`](./decisions/hosted-empty-state-gating.md) ·
  [`workspace-picker`](./decisions/workspace-picker.md)
- ADRs: 0002, 0003, 0004, 0005, 0006.
- Persistence: [`persistence-spec.md`](./persistence-spec.md)
- Tokens package: [`packages/tokens/`](../../packages/tokens/)
