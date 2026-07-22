# IndexedDB persistence schema (hosted)

## Status

Accepted (2026-07-22) — closes #169. Unblocks #173 (review section spec) and
indirectly #175 (final README). Schema contract only; no runtime code in this
ticket.

## Context

ADR-0004 locks the hosted web app at **no-auth, single-user, IndexedDB
persistence**. This document is the implementable store contract so an
implementer can write `openDB()` and migrations without re-deriving shapes from
the ADR.

**Persistence boundary**

| Mode | IndexedDB role |
|---|---|
| **hosted** | Primary persistence for preferences, Feedback Notes, Improve Plans, and learn progress. No backend. |
| **localhost** | Does not use IndexedDB for run/review artifacts (disk / Runtime). May *mirror* `theme` / `env` from `preferences` for cross-session chrome only. |

Database name: `arc-skill-eval-web` (constant). Object stores below are the only
stores in v1.

Glossary terms **Feedback Note** and **Improve Plan** are owned by
[`docs/web-app/CONTEXT.md`](./CONTEXT.md).

## Stores

### Database constants

```ts
export const IDB_NAME = 'arc-skill-eval-web';
export const IDB_SCHEMA_VERSION = 1; // bump when object-store layout changes
```

`IDB_SCHEMA_VERSION` is the IndexedDB database version passed to `indexedDB.open`.
Separately, `preferences.schemaVersion` tracks *record-shape* migrations inside
an open DB (see [Migrations](#migrations)).

---

### 1. `preferences`

Single-row chrome prefs (theme, env, workspace favorites) plus the
record-shape `schemaVersion`.

| | |
|---|---|
| **Primary key** | `"singleton"` (string literal; one row only) |
| **Indexes** | none |
| **Key path** | `id` |

**Fields**

| Field | Type | Notes |
|---|---|---|
| `id` | `"singleton"` | Primary key |
| `theme` | `"light" \| "dark"` | Theme Variant |
| `env` | `"localhost" \| "hosted"` | Env Variant |
| `workspaceFavorites` | `string[]` | Localhost workspace paths; empty on hosted |
| `schemaVersion` | `number` | Record-shape version; see Migrations |
| `updatedAt` | `string` (ISO-8601) | Last write |

**Example record**

```json
{
  "id": "singleton",
  "theme": "dark",
  "env": "hosted",
  "workspaceFavorites": [],
  "schemaVersion": 1,
  "updatedAt": "2026-07-22T04:00:00.000Z"
}
```

---

### 2. `feedback`

Per-run **Feedback Note** records authored on `review` (text-only; yellow
left-border accent in UI). Drives Improve Plan generation.

| | |
|---|---|
| **Primary key** | `noteId` (string; client-generated UUID) |
| **Indexes** | `byRunId` → `runId` (non-unique); `byRunCase` → `[runId, caseId]` (non-unique) |
| **Key path** | `noteId` |

**Fields**

| Field | Type | Notes |
|---|---|---|
| `noteId` | `string` | Primary key |
| `runId` | `string` | Eval run id |
| `caseId` | `string` | Case within the run |
| `note` | `string` | Free-form Feedback Note body |
| `createdAt` | `string` (ISO-8601) | Authored at |

**Example record**

```json
{
  "noteId": "note_01J2ABCDEF",
  "runId": "run_2026-07-21_abc",
  "caseId": "case_summarize_pr",
  "note": "Assertion passes but rationale is too terse for the failure mode.",
  "createdAt": "2026-07-21T18:22:00.000Z"
}
```

---

### 3. `improvePlans`

Latest **Improve Plan** draft(s) per run. Plans are keyed by `planId`; query by
`runId` via index. On hosted, `--apply` downloads JSON — never silent disk write,
never network upload (ADR-0004).

| | |
|---|---|
| **Primary key** | `planId` (string; client-generated UUID) |
| **Indexes** | `byRunId` → `runId` (non-unique) |
| **Key path** | `planId` |

**Fields**

| Field | Type | Notes |
|---|---|---|
| `planId` | `string` | Primary key |
| `runId` | `string` | Source run |
| `items` | `ImprovePlanItem[]` | Before/after + rationale entries |
| `sourceNoteIds` | `string[]` | `noteId`s that produced this plan |
| `createdAt` | `string` (ISO-8601) | |
| `updatedAt` | `string` (ISO-8601) | |

```ts
type ImprovePlanItem = {
  path: string;
  before: string;
  after: string;
  rationale: string;
};
```

**Example record**

```json
{
  "planId": "plan_01J2XYZ",
  "runId": "run_2026-07-21_abc",
  "sourceNoteIds": ["note_01J2ABCDEF"],
  "items": [
    {
      "path": "SKILL.md",
      "before": "Be concise.",
      "after": "Be concise; name the failing assertion class.",
      "rationale": "Feedback Note on case_summarize_pr"
    }
  ],
  "createdAt": "2026-07-21T19:00:00.000Z",
  "updatedAt": "2026-07-21T19:00:00.000Z"
}
```

---

### 4. `learnProgress`

Per-chapter reader position and completion on `learn` (parity both envs; hosted
uses IndexedDB, localhost may mirror or use this store for chrome continuity).

| | |
|---|---|
| **Primary key** | `chapterId` (string) |
| **Indexes** | `byChapterId` → `chapterId` (unique; same as key path for IDB cursor helpers) |
| **Key path** | `chapterId` |

**Fields**

| Field | Type | Notes |
|---|---|---|
| `chapterId` | `string` | Primary key (e.g. `chapter-02`) |
| `position` | `number` | Scroll / section offset (px or heading index; section spec owns unit) |
| `completed` | `boolean` | Chapter marked complete |
| `updatedAt` | `string` (ISO-8601) | |

**Example record**

```json
{
  "chapterId": "chapter-02",
  "position": 420,
  "completed": false,
  "updatedAt": "2026-07-22T01:10:00.000Z"
}
```

## Migrations

### Version constants

- **`IDB_SCHEMA_VERSION`** (module constant, currently `1`) — IndexedDB
  `open(name, version)` integer. Bump when adding/removing stores or indexes.
- **`preferences.schemaVersion`** (integer on the singleton row) — record-shape
  version for in-transaction data transforms after the DB is open.

### Version history

| `schemaVersion` | Date | Change |
|---|---|---|
| `1` | 2026-07-22 | Initial stores: `preferences`, `feedback`, `improvePlans`, `learnProgress` with indexes above. |

Adds of optional fields are non-breaking and may stay on the same
`schemaVersion` if readers tolerate missing keys. Breaking renames/removals
require bumping both `IDB_SCHEMA_VERSION` (if store layout changes) and
`preferences.schemaVersion`, plus a migration plan on a future ticket
(ADR-0004).

### `onupgradeneeded` (store layout)

```ts
function upgrade(db: IDBDatabase, oldVersion: number, newVersion: number): void {
  // v0 → v1: create all four stores + indexes listed in Stores.
}
```

### Record-shape migration signature

```ts
/**
 * Runs inside an existing readwrite IDBTransaction covering every store that
 * will be read or written. Updates preferences.schemaVersion to toVersion
 * when finished. Must be idempotent for (fromVersion, toVersion) pairs.
 */
function migrate(
  fromVersion: number,
  toVersion: number,
  tx: IDBTransaction,
): Promise<void>;
```

Callers: after `openDB` resolves, read `preferences.schemaVersion` (default `0`
if missing), then if `from < IDB_SCHEMA_VERSION` / target record version, invoke
`migrate(from, to, tx)` before serving UI.

## Reset & Privacy

### `Reset hosted data`

A destructive erasure action on the **hosted** empty-state / Import Card chrome
for `run` and `review` (hero footer button per ADR-0004;
[`hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md)
allows the control on that chrome without changing gating).

**Behavior**

1. Clear **every** object store in `arc-skill-eval-web` (`preferences`,
   `feedback`, `improvePlans`, `learnProgress`).
2. Reload the app so Env/Theme chrome re-seed defaults.

**Privacy stance**

- IndexedDB contents are **never written silently** to the filesystem.
- IndexedDB contents are **never uploaded** to any network endpoint.
- Hosted `--apply` on an Improve Plan **downloads** JSON only (ADR-0004).
- Feedback Note free-form text stays in the visitor's browser until Reset or
  manual clear via browser storage UI.

## References

- [#169](https://github.com/andysolomon/arc-skill-eval/issues/169) — Define the IndexedDB persistence schema (this doc)
- [ADR-0004](../adr/ADR-0004-no-auth-single-user-indexeddb-hosted.md) — no-auth, single-user IndexedDB on hosted
- [`docs/web-app/CONTEXT.md`](./CONTEXT.md) — glossary (**Feedback Note**, **Improve Plan**, Env/Theme Variant)
- [`docs/web-app/decisions/hosted-empty-state-gating.md`](./decisions/hosted-empty-state-gating.md) — Empty State Hero / Import Card chrome for Reset
- [#173](https://github.com/andysolomon/arc-skill-eval/issues/173) — review section spec (consumes `feedback` + `improvePlans`)
- [#175](https://github.com/andysolomon/arc-skill-eval/issues/175) — final README (persistence boundary summary)
