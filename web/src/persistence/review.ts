import { openDatabase, requestToPromise, transactionDone } from './db';
import type { FeedbackRecord } from './feedback';
import type { ImprovePlanRecord } from './improvePlans';

export const listFeedback = async (): Promise<FeedbackRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction('feedback', 'readonly');
  const done = transactionDone(tx);
  const records = await requestToPromise<FeedbackRecord[]>(tx.objectStore('feedback').getAll());
  await done;
  db.close();

  return records;
};

export const deleteFeedback = async (noteId: string): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction('feedback', 'readwrite');
  const done = transactionDone(tx);

  tx.objectStore('feedback').delete(noteId);
  await done;
  db.close();
};

export const listImprovePlans = async (): Promise<ImprovePlanRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction('improvePlans', 'readonly');
  const done = transactionDone(tx);
  const records = await requestToPromise<ImprovePlanRecord[]>(tx.objectStore('improvePlans').getAll());
  await done;
  db.close();

  return records;
};
