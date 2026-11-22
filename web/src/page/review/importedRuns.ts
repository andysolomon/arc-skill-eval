/**
 * Imported runs live in memory for the lifetime of the document, like the
 * React app's module-level store: they survive switching sections (which
 * re-runs the page's `init`) but not a reload. Owned by the
 * `LoadReviewData` / `StoreImportedRuns` Commands; nothing else touches it.
 */

import { Effect } from 'effect';

import type { ReviewRun } from './domain';

const store: { runs: ReadonlyArray<ReviewRun> } = { runs: [] };

export const readImportedRuns: Effect.Effect<ReadonlyArray<ReviewRun>> = Effect.sync(() => store.runs);

export const writeImportedRuns = (runs: ReadonlyArray<ReviewRun>): Effect.Effect<void> =>
  Effect.sync(() => {
    store.runs = runs;
  });
