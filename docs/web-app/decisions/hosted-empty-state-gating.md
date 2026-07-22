# Hosted empty-state gating convention

## Status

Accepted (2026-07-22) — closes #168.

## Context

Every **App Section** (`run`, `browse`, `create`, `review`, `learn`) has a **localhost**
and a **hosted** **Env Variant**. The design handoff renders the correct surface via
`data-screen-label="… (localhost|hosted)"` (or an unscoped label when both envs share
one layout). Section specs (#170–#174) need one structural convention so gating stays
parallel — not a mix of feature flags, ad-hoc `if`s, and one-off routes.

Surfaces in scope:

- **Workspace Picker** — localhost-only (no filesystem on hosted).
- **Empty State Hero** — 560px card with a `localhost only` badge, install/run command
  blocks, and escape-hatch links; used when the active env is the *disallowed* side for
  that section's primary capability.
- **Import Card** — hosted-only dashed target for JSON (evals / artifact bundle) on
  `run` and `review`.

Adjacent locks: ADR-0004 (no-auth IndexedDB on hosted) and the glossary in
`docs/web-app/CONTEXT.md`. Workspace *mechanism* (File System Access API vs bridge)
remains #167 and does not change this visibility rule.

## Decision

**Env-conditional section routes under one `<AppRoot>`, not feature flags and not
per-component one-offs.**

### (a) Declaring the localhost vs hosted variant

1. Zustand (ADR-0002) owns top-level `env: "localhost" | "hosted"` (persisted per
   ADR-0004 `preferences`).
2. A single `<AppRoot>` reads `env`, derives `const hosted = env === "hosted"`, and
   sets `data-env="localhost|hosted"` on the app root (alongside existing
   `data-theme` on `<html>`).
3. Section routes (`/run`, `/browse`, `/create`, `/review`, `/learn`) render a
   localhost branch or a hosted branch from `hosted` / `env`. Prefer one section
   module with an env switch over duplicated trees.
4. Keep handoff parity for tests: set `data-screen-label` to
   `"<section> (localhost|hosted)"` when the branches differ, or `"<section>"` when
   the layout is shared (create / review / learn in the prototype).

Rejected alternatives: global feature-flag service; scattering `if (hosted)` inside
leaf components without a section-level branch; separate deploy targets per env.

### (b) Workspace Picker visibility

```
visible = !hosted
```

When `hosted` is true, omit the picker entirely. The **Install Command Pill** stays
visible on both envs. Picker *mechanism* is #167; this decision only pins visibility.

### (c) Empty State Hero (disallowed-env side only)

Show the **Empty State Hero** only when the active Env Variant is the **disallowed**
side for that section's primary capability. It replaces the section body (centered
560px card). Do **not** use it as a generic "no rows yet" placeholder inside an
allowed surface — those stay inline empty sentences / dashed boxes per `design.md`.

**Import Card** is a different component: gated with `hosted` on `run` and `review`
as the *allowed* hosted primary surface (import / validate / sample). It is not an
Empty State Hero. ADR-0004's `Reset hosted data` may sit on the hosted empty / import
chrome for `run` and `review` once those section specs land.

Section-specific Empty State Hero copy (headline; body + commands follow the
prototype):

| Section | Disallowed env | Hero headline |
|---|---|---|
| `run` | hosted *(execution)* | `running an eval needs an LLM` |
| `browse` | hosted | `browse reads local run artifacts` |
| `create` | hosted *(LLM `create --guided` only)* | `generate starter evals needs an LLM` |
| `review` | *(none for full section)* | — ; hosted uses **Import Card** |
| `learn` | *(none)* | — ; full parity both envs |

Notes:

- **`run` hosted:** destination lock (#170, CONTEXT) — primary hosted surface is the
  **Import Card** (validate / sample). The Empty State Hero copy above is the
  execution-gate message (install CTA / escape hatches to `review` and `learn`),
  used when the section is presenting the localhost-only execution story rather than
  an imported suite. Section spec #170 owns the exact compose of Import Card vs hero.
- **`create` hosted:** the wizard itself is allowed; only the LLM generate path is
  disallowed. Prefer the prototype's cyan hosted callout for the shared wizard, and
  reserve the Empty State Hero for a dedicated guided-generate gate if #172 needs a
  full-card treatment.
- **`review` / `learn`:** no full-section Empty State Hero for env gating.

### (d) Per-section visibility table

Primary surface per App Section × Env Variant:

| Section | localhost | hosted |
|---|---|---|
| `run` | Composer + console (+ Empty State Hero if no workspace) | Import Card; execution Empty State Hero copy as install CTA (#170) |
| `browse` | Four-panel artifact browser | Empty State Hero (`browse reads local run artifacts`) |
| `create` | 4-step wizard; LLM generate available | Wizard hand-assemble; LLM generate gated (callout / hero per #172) |
| `review` | Disk review under `./evals-runs` | Import Card (artifact JSON) |
| `learn` | Chapter reader | Chapter reader (parity) |
| *chrome* | Workspace Picker **on** | Workspace Picker **off** (`!hosted`) |

## Consequences

- Section specs #170–#174 and the final README #175 share one gating vocabulary:
  `env` / `hosted` / `data-env` / Empty State Hero / Import Card / Workspace Picker.
- **ADR-0004** remains the persistence boundary: hosted IndexedDB for preferences
  (including `env`), feedback, improve plans; Empty State Hero / Import Card chrome
  may host `Reset hosted data` without changing this gating decision.
- **`docs/web-app/CONTEXT.md`** terms (**App Section**, **Env Variant**, **Empty
  State Hero**, **Workspace Picker**, **Import Card**) stay authoritative; this file
  only pins *how* they are declared and switched.
- #167 (picker mechanism) can close independently; it must not reintroduce a picker
  on hosted.
- Implementers must not invent a second env signal (URL param, build-time
  `IMPORT.META.ENV` flag, etc.) that disagrees with the Zustand `env` store.

## References

- [#168 — Pin the hosted-empty-state gating convention](https://github.com/andysolomon/arc-skill-eval/issues/168)
- [#167 — Workspace picker mechanism (localhost)](https://github.com/andysolomon/arc-skill-eval/issues/167) (open; visibility only here)
- [#170](https://github.com/andysolomon/arc-skill-eval/issues/170)–[#174](https://github.com/andysolomon/arc-skill-eval/issues/174) section specs; [#175](https://github.com/andysolomon/arc-skill-eval/issues/175) README
- [ADR-0002](../../adr/ADR-0002-web-app-stack-vite-react-ts-tailwind-token-mapped.md) — Vite + React + Zustand
- [ADR-0004](../../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) — no-auth IndexedDB on hosted
- [`docs/web-app/CONTEXT.md`](../CONTEXT.md) — App Section, Env Variant, Empty State Hero, Workspace Picker, Import Card
- Design handoff `design.md` § env gating; prototype `data-screen-label` screens in
  `docs/Arc skill eval web design/design_handoff_arc_skill_eval/`
