import { openDatabase, requestToPromise, transactionDone } from './db';

export type FeedbackRecord = {
  noteId: string;
  runId: string;
  caseId?: string;
  note: string;
  createdAt: string;
};

export type FeedbackInput = Omit<FeedbackRecord, 'noteId' | 'createdAt'> &
  Partial<Pick<FeedbackRecord, 'noteId' | 'createdAt'>>;

export const addFeedback = async (input: FeedbackInput): Promise<FeedbackRecord> => {
  const db = await openDatabase();
  const tx = db.transaction('feedback', 'readwrite');
  const done = transactionDone(tx);
  const record: FeedbackRecord = {
    noteId: input.noteId ?? crypto.randomUUID(),
    runId: input.runId,
    caseId: input.caseId,
    note: input.note,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  await requestToPromise(tx.objectStore('feedback').put(record));
  await done;
  db.close();

  return record;
};
