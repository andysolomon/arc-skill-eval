/**
 * The Create wizard's draft and current step, stored as a `learnProgress`
 * record under a reserved chapter id (the React app's storage shape, so
 * existing drafts keep loading).
 *
 * Writes are serialized: each save waits for the previous one, so a burst of
 * keystrokes can never land out of order and leave a stale draft behind.
 */

import { openDatabase, requestToPromise, transactionDone } from './db';
import { putLearnProgress, type LearnProgressRecord } from './learnProgress';

export const CREATE_WIZARD_CHAPTER_ID = 'create-wizard';

export type CreateProgressRecord = LearnProgressRecord & {
  activeStep: string;
  draft: unknown;
};

export const readCreateProgress = async (): Promise<unknown> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<unknown>(
    tx.objectStore('learnProgress').get(CREATE_WIZARD_CHAPTER_ID),
  );
  await done;
  db.close();

  return record;
};

let pendingWrite: Promise<unknown> = Promise.resolve();

export const writeCreateProgress = (record: CreateProgressRecord): Promise<void> => {
  const write = pendingWrite.catch(() => undefined).then(() => putLearnProgress(record));
  pendingWrite = write;
  return write.then(() => undefined);
};
