# Workspace picker mechanism (localhost)

## Status

Accepted (2026-07-22) — closes #167; unblocks #170.

## Context

The **Workspace Picker** is localhost-only chrome: a 30px outlined pill in the global
header that opens a 288px dropdown (favorites, dashed `choose a folder…` target,
skills-found list). Hosted hides the picker entirely
([hosted-empty-state-gating.md](./hosted-empty-state-gating.md) § (b);
[`docs/web-app/CONTEXT.md`](../CONTEXT.md) **Workspace Picker**).

Browsers cannot grant durable, cross-browser directory access to a Vite SPA without
help. #167 asks which v0 mechanism to pin, and what detects "localhost is ready."
Section specs (especially #170 `run`) need that answer before composing the
no-workspace Empty State Hero vs composer.

Candidates considered:

| Id | Mechanism |
|---|---|
| **(A)** | Chromium-only File System Access API `showDirectoryPicker` |
| **(B)** | Tauri / Electron native bridge |
| **(C)** | CLI-side directory handshake (Node CLI daemon → localhost HTTP/WS) |
| **(D)** | Polyfill / progressive-enhancement hybrid of (A)+(C) |

## Decision

**Pick (C): CLI-side directory handshake.** The Runtime CLI (or a thin companion
daemon started by it) serves a localhost HTTP and/or WebSocket endpoint. The web
app asks that endpoint to pick a directory, list favorites, and report skills found
under the chosen path. Paths and file reads stay on the Node side; the browser
only receives sanitized summaries over the loopback wire.

### Why (C) over the alternatives

**(A)** `showDirectoryPicker` is Chromium-only. Safari and Firefox lack a
comparable durable directory grant for this product shape. Pinning Chromium would
split the localhost Env Variant by browser and fight the "cross-browser reach"
goal for v0. Permission prompts and handle persistence also differ enough across
Chromium versions that the UI contract would still need a non-API fallback.

**(B)** A Tauri/Electron shell would solve filesystem access, but it turns the
web app into a packaged desktop product. That conflicts with ADR-0004's hosted
no-auth web model and with shipping the same Vite build for localhost and hosted.
Native packaging is out of scope for the web-app charter; the CLI already owns
disk and LLM execution.

**(D)** A hybrid (prefer FSA when present, else CLI) doubles the surface area:
two pick flows, two permission stories, and divergent favorites persistence.
Progressive enhancement is attractive later; for v0 one mechanism keeps #170's
localhost branch testable and the Empty State Hero story single-pathed.

**(C)** reuses the Runtime CLI the product already requires for eval execution.
Loopback HTTP/WS works in every browser that can load `http://localhost`. The
daemon can open a native folder dialog (or accept a path) and return path +
skill discovery results. Favorites live beside CLI config, not in a browser-only
store that hosted IndexedDB (ADR-0004) would need to special-case.

### Localhost detection rule

The Workspace Picker is eligible only when **both** hold:

1. `env === "localhost"` (Zustand top-level env per
   [hosted-empty-state-gating.md](./hosted-empty-state-gating.md) § (a);
   `visible = !hosted`).
2. The CLI directory daemon is **reachable** on the known loopback endpoint
   (v0 default: `http://127.0.0.1:<port>/health` or equivalent WS ping on the
   documented port/socket). Reachability is a live check, not inferred from URL
   alone.

If (1) fails → omit the picker (hosted rule). If (1) holds but (2) fails → keep
the picker chrome visible as the localhost affordance, but treat workspace as
unset and show the fallback below (do not pretend a folder was chosen).

### Header wire-up

1. Global header renders the **30px outlined pill** only when `env === "localhost"`
   (gating doc § (b)). Pill label shows the active workspace basename, or a
   placeholder when unset / daemon unreachable.
2. Click opens the **288px dropdown** anchored under the pill:
   - **Favorites list** — paths previously chosen via the daemon (CLI-side
     persistence); selecting one sets the active workspace through the handshake.
   - **Dashed `choose a folder…` target** — invokes the daemon's pick RPC; on
     success, updates the pill label and refreshes skills-found.
   - **Skills-found list** — daemon scan of the active workspace (skill dirs /
     `SKILL.md` adjacency); read-only in the dropdown.
3. Closing the dropdown does not clear the workspace. Clearing / switching is
   explicit via favorites or a new pick. Hosted never mounts this control.

### Fallback when the mechanism is unavailable

| Condition | Behavior |
|---|---|
| `env === "hosted"` | Picker omitted; Install Command Pill remains. |
| `env === "localhost"`, daemon unreachable | Pill still visible; open dropdown explains CLI not running / how to start it. No folder pick. Sections that need a workspace (e.g. `run`) show the **Empty State Hero** with install/run command blocks (gating doc § (c); CONTEXT **Empty State Hero**). |
| Daemon up, no workspace chosen yet | Same Empty State Hero on workspace-gated sections until a path is set. |
| Daemon errors mid-pick | Keep prior workspace if any; surface a non-blocking error in the dropdown; do not navigate away. |

Do not fall back to (A) or a `<input type="file" webkitdirectory>` polyfill in v0 —
that would reintroduce browser splits the decision rejects.

## Consequences

- #170 (`run` localhost) can assume workspace path + skills-found arrive from the
  CLI handshake, and can compose composer vs Empty State Hero from
  "daemon reachable ∧ workspace set."
- Visibility stays owned by
  [hosted-empty-state-gating.md](./hosted-empty-state-gating.md); this file only
  pins *how* the picker talks to disk when visible.
- Glossary term **Workspace Picker** in
  [`docs/web-app/CONTEXT.md`](../CONTEXT.md) remains authoritative for chrome
  shape (30px pill → 288px panel); implementers must not rename it.
- ADR-0004 hosted IndexedDB is unchanged: no directory handles stored for hosted;
  localhost favorites prefer CLI-side storage over inventing a second browser DB.
- Future (D) hybrid or (A) Chromium-only acceleration requires a new decision;
  v0 code paths should not soft-depend on `showDirectoryPicker`.

## References

- [#167 — Decide the workspace picker mechanism (localhost mode)](https://github.com/andysolomon/arc-skill-eval/issues/167)
- [#168 — Pin the hosted-empty-state gating convention](https://github.com/andysolomon/arc-skill-eval/issues/168)
- [#170 — Run section spec](https://github.com/andysolomon/arc-skill-eval/issues/170)
- [ADR-0004](../../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) — no-auth IndexedDB on hosted
- [hosted-empty-state-gating.md](./hosted-empty-state-gating.md) — picker visibility (`visible = !hosted`)
- [`docs/web-app/CONTEXT.md`](../CONTEXT.md) — Workspace Picker, Empty State Hero, Env Variant
