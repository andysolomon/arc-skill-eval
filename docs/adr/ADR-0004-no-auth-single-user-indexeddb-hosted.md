# ADR-0004: Hosted web app is no-auth, single-user, with IndexedDB persistence

## Status

Accepted (2026-07-21)

## Context

The web app renders localhost and hosted variants of every section.
Hosted mode has no LLM execution and no filesystem access. The specification
calls out the localhost-only features (`Workspace Picker`, `run`, etc.) with
empty-state cards and import cards. The agreed configuration is "no-auth,
single-user, with IndexedDB persistence."

Constraints considered:

- **Hosted execution boundary:** hosted can import JSON but cannot invoke the
  Runtime CLI or call an LLM. Any persistence layer must work without a backend.
- **Privacy:** `feedback.json` notes recorded in `review` can contain
  free-form text about an evaluated skill. Where this lives when hosted matters.
- **Workspace picker:** listed as localhost-only because hosted mode has no filesystem.
- **Multi-user authentication:** deferred, not rejected.

## Options considered

- **A. No-auth, single-user, IndexedDB persistence** *(chosen).* A hosted visitor
  sees their own state in the browser (theme, env, workspace favorites, feedback
  notes, improve plans, learn-progress). No accounts. No backend persistence.
  Data remains in that browser's IndexedDB.
- **B. GitHub OAuth, server-side persistence.** Adds an identity and removes
  per-browser fragility, but authentication is deferred and the web app is
  designed for one user at a time. OAuth adds no required capability.
  Rejected.
- **C. localStorage only.** Simpler than IndexedDB, but the expected persistence
  footprint (per-run feedback, improve plan drafts, multi-store schemas) eventually
  exceeds localStorage's 5MB ceiling.
- **D. Serverless KV (Cloudflare KV / Vercel KV).** Gives cross-device persistence
  without auth, but requires a backend and an anonymous identifier. Rejected for now.

## Decision

**Option A: no-auth, single-user, IndexedDB-persisted.**

1. **Auth:** none. Hosted visitors are anonymous by default.
2. **Persistence boundary:** hosted mode only; localhost mode reads from disk and
   does not touch IndexedDB except to *mirror* theme/env preferences for cross-session
   convenience.
3. **Stores:** initially:
   - `preferences`: `{ theme, env, workspaceFavorites[] }`. One row, key `singleton`.
   - `feedback`: indexed by `runId`; stores the list of `Feedback Note` records
     authored in `review`.
   - `improvePlans`: indexed by `runId`; stores the latest Improve Plan per run.
   - `learnProgress`: indexed by chapter id; stores position and completion state.
     *(Low priority. Ticket 11 may defer this if chapter pagination preserves
     scroll position.)*
4. **Schema migrations:** a versioned `schemaVersion` key in `preferences`. Additions
   are non-breaking; a breaking schema change requires a migration plan and is
   gated on a future ticket.
5. **Erasure:** a `Reset hosted data` action visible at the bottom of the
   empty-state hero on `run` and `review`. Clears every IndexedDB store and
   reloads. Surfaces the privacy stance to the visitor.
6. **"Apply" semantics on hosted:** when the `Improve Plan`'s `--apply` button is
   pressed on hosted, the resulting artifact is downloaded as JSON. Never silently
   written to disk; never network-uploaded.

## Consequences

- **Positive:** no backend; hosted cost is limited to static
  bundle's CDN egress.
- **Positive:** the `feedback.json` artifact downloaded from `--apply` belongs to the
  visitor's by construction; no Terms-of-Service ambiguity.
- **Positive:** anything persisted on hosted should, when
  archived into a directory the Runtime can read, produce the same `feedback.json`
  shape.
- **Negative:** cross-device state requires a future export/import flow. Not in
  this ADR's scope; a future ticket can graduate a manual JSON export into a
  separate ADR.
- **Negative:** multi-user support would require changes to the storage layer.
- **Neutral:** the exported `feedback.json` schema must match the Runtime's
  `feedback.json` schema. Runtime owns that schema.

## References

- `docs/web-app/CONTEXT.md` *(Web App glossary — `Feedback Note`, `Improve Plan`)*
- The interactive prototype's `data-screen-label="..."` attributes codify the
  localhost/hosted split per section.
- ADR-0002 (web app stack — Vite/Tailwind/React; the bundler choice that lets us
  ship pure static + IndexedDB).
