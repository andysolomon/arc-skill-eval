# ADR-0004: Hosted web app is no-auth, single-user, with IndexedDB persistence

## Status

Accepted (2026-07-21)

## Context

The web app handoff renders both a localhost and a hosted variant of every section.
Hosted mode has no LLM execution and no filesystem access — by design, the handoff
calls out the localhost-only features (`Workspace Picker`, `run`, etc.) with
empty-state heroes and import cards. The destination locks the spec at "no-auth,
single-user, with IndexedDB persistence" in answer to the breadth-first grill.

Constraints considered:

- **Hosted execution boundary** — hosted can import JSON but cannot invoke the
  Runtime CLI or call an LLM. Any persistence layer must work without a backend.
- **Privacy surface** — `feedback.json` notes recorded in `review` can contain
  free-form text about an evaluated skill. Where this lives when hosted matters.
- **Workspace picker** — listed as localhost-only; the absence of a filesystem on
  hosted is the gating.
- **"Multi-user" auth is not in this effort's destination** — deferred, not denied.

## Considered Options

- **A. No-auth, single-user, IndexedDB persistence** *(chosen)* — A hosted visitor
  sees their own state in the browser (theme, env, workspace favorites, feedback
  notes, improve plans, learn-progress). No accounts. No backend persistence.
  Privacy is "what's in your IndexedDB stays in your IndexedDB".
- **B. GitHub OAuth, server-side persistence** — Adds a real identity, removes
  per-browser fragility, but the destination defers auth and the web app is
  single-tenant by use case; OAuth buys nothing for a one-visitor-at-a-time tool.
  Rejected.
- **C. localStorage only** — Simpler than IndexedDB, but the handoff's persistence
  footprint (per-run feedback, improve plan drafts, multi-store schemas) eventually
  exceeds localStorage's 5MB ceiling. IndexedDB for free.
- **D. Serverless KV (Cloudflare KV / Vercel KV)** — Gives cross-device persistence
  without auth, but requires a backend and a fingerprinting identifier; the
  auth-less privacy story gets awkward. Rejected for now.

## Decision

**Option A: no-auth, single-user, IndexedDB-persisted.**

1. **Auth** — None. Hosted visitors are anonymous by default.
2. **Persistence boundary** — Hosted mode only; localhost mode reads from disk and
   does not touch IndexedDB except to *mirror* theme/env preferences for cross-session
   convenience.
3. **Stores** — Initially:
   - `preferences` — `{ theme, env, workspaceFavorites[] }`. One row, key `singleton`.
   - `feedback` — Indexed by `runId`; stores the list of `Feedback Note` records
     authored in `review`.
   - `improvePlans` — Indexed by `runId`; stores the latest Improve Plan per run.
   - `learnProgress` — Indexed by chapter id; stores position + completion state.
     *(Low priority — Ticket 11 may defer this if chapter pagination comes free from
     scroll position.)*
4. **Schema migrations** — A versioned `schemaVersion` key in `preferences`. Adds
   are non-breaking; a breaking schema change requires a migration plan and is
   gated on a future ticket.
5. **Erasure** — A `Reset hosted data` action visible at the bottom of the
   empty-state hero on `run` and `review`. Clears every IndexedDB store and
   reloads. Surfaces the privacy stance to the visitor.
6. **"Apply" semantics on hosted** — When the `Improve Plan`'s `--apply` button is
   pressed on hosted, the resulting artifact is downloaded as JSON. Never silently
   written to disk; never network-uploaded.

## Consequences

- **Positive** — Zero backend surface; the cost ceiling for hosted is the static
  bundle's CDN egress.
- **Positive** — The `feedback.json` artifact downloaded from `--apply` is the
  visitor's by construction; no Terms-of-Service ambiguity.
- **Positive** — Localhost parity: anything persisted on hosted should, when
  archived into a directory the Runtime can read, produce the same `feedback.json`
  shape.
- **Negative** — Cross-device state requires a future export/import flow. Not in
  this ADR's scope; a future ticket can graduate a manual JSON export into a
  parking-lot ADR.
- **Negative** — A future "multi-user" need forces a re-decomposition of the
  storage layer. Mitigated by the boundary being explicit (one boundary to redraw).
- **Neutral** — The exported `feedback.json` schema is co-owned with the Runtime's
  `feedback.json` schema — both contexts must agree, owned by Runtime.

## References

- `docs/web-app/CONTEXT.md` *(Web App glossary — `Feedback Note`, `Improve Plan`)*
- The interactive prototype's `data-screen-label="..."` attributes codify the
  localhost/hosted split per section.
- ADR-0002 (web app stack — Vite/Tailwind/React; the bundler choice that lets us
  ship pure static + IndexedDB).
