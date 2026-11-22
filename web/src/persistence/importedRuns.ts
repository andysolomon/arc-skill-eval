/**
 * Runs imported in Review (hosted mode), shared with Browse.
 *
 * The React app kept these in a module-level variable inside
 * `sections/review/useReviewData.ts`: they survived section switches but not
 * a reload, and "Reset hosted data" emptied them. This module keeps exactly
 * that lifetime, behind Effects so pages only touch it from Commands.
 *
 * Records are plain JSON-shaped run results in the shape the React
 * `parseReviewRuns` normalizer produced (optional fields are absent, not
 * `Option`): Review writes them, Browse decodes them defensively.
 */

import { Effect } from 'effect';

import { subscribeHostedDataReset } from './db';

export type ImportedCaseStatus = 'pass' | 'fail' | 'partial' | 'timeout';

export type ImportedCase = {
  id: string;
  prompt: string;
  status: ImportedCaseStatus;
  output?: string;
  failureEvidence?: string;
  withPassed?: number;
  withTotal?: number;
  withoutPassed?: number;
  withoutTotal?: number;
  delta?: string;
};

export type ImportedRun = {
  id: string;
  skill: string;
  workspaceRoot: string;
  evalsJson?: unknown;
  finishedAt: string;
  status?: ImportedCaseStatus;
  cost?: number;
  exitCode?: number;
  cases: ReadonlyArray<ImportedCase>;
};

let importedRuns: ReadonlyArray<ImportedRun> = [];

subscribeHostedDataReset(() => {
  importedRuns = [];
});

export const loadImportedRuns: Effect.Effect<ReadonlyArray<ImportedRun>> = Effect.sync(() => importedRuns);

export const saveImportedRuns = (runs: ReadonlyArray<ImportedRun>): Effect.Effect<void> =>
  Effect.sync(() => {
    importedRuns = runs;
  });
