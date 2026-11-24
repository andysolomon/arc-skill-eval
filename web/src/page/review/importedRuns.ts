import { Effect, Schema } from 'effect';

import { openDatabase, requestToPromise, transactionDone } from '@/persistence/db';

import { ReviewRun } from './domain';

const RECORD_ID = 'current';

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

export const readImportedRuns: Effect.Effect<ReadonlyArray<ReviewRun>> = Effect.tryPromise(readStored).pipe(
  Effect.flatMap(Schema.decodeUnknownEffect(RunsJson)),
  Effect.catch(() => Effect.succeed([])),
);

export const writeImportedRuns = (runs: ReadonlyArray<ReviewRun>): Effect.Effect<void> =>
  Schema.encodeEffect(RunsJson)(runs).pipe(
    Effect.flatMap((encoded) => Effect.tryPromise(() => writeStored(encoded))),
    Effect.ignore,
  );
