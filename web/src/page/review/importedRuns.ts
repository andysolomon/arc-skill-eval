/**
 * Runs imported on the Review page (hosted mode). They live in IndexedDB
 * next to the feedback notes written about them, so both survive a reload
 * and "Reset hosted data" clears both. Owned by the `LoadReviewData` /
 * `StoreImportedRuns` Commands; Browse reads them too.
 */

import { Effect, Schema } from 'effect';

import { openDatabase, requestToPromise, transactionDone } from '@/persistence/db';

import { ReviewRun } from './domain';

const RECORD_ID = 'current';

/** Option fields become plain JSON on the way into IndexedDB and back. */
const RunsJson = Schema.toCodecJson(Schema.Array(ReviewRun));

type StoredRuns = Readonly<{ id: string; runs: unknown }>;

const readStored = async (): Promise<unknown> => {
  const db = await openDatabase();
  const tx = db.transaction('importedRuns', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<StoredRuns | undefined>(tx.objectStore('importedRuns').get(RECORD_ID));
  await done;
  db.close();
  return record?.runs ?? [];
};

const writeStored = async (runs: unknown): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction('importedRuns', 'readwrite');
  const done = transactionDone(tx);
  tx.objectStore('importedRuns').put({ id: RECORD_ID, runs });
  await done;
  db.close();
};

/** The stored runs; empty when nothing was imported or the record cannot be read. */
export const readImportedRuns: Effect.Effect<ReadonlyArray<ReviewRun>> = Effect.tryPromise(readStored).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(RunsJson)),
  Effect.catch(() => Effect.succeed([])),
);

export const writeImportedRuns = (runs: ReadonlyArray<ReviewRun>): Effect.Effect<void> =>
  Schema.encodeEffect(RunsJson)(runs).pipe(
    Effect.flatMap((encoded) => Effect.tryPromise(() => writeStored(encoded))),
    Effect.ignore,
  );
