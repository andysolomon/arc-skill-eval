import { openDatabase, requestToPromise, transactionDone } from './db';

export type LearnProgressRecord = {
  chapterId: string;
  scrollPos: number;
  completedSteps: string[];
  lastVisited: string;
};

export const putLearnProgress = async (
  progress: LearnProgressRecord,
): Promise<LearnProgressRecord> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readwrite');
  const done = transactionDone(tx);

  await requestToPromise(tx.objectStore('learnProgress').put(progress));
  await done;
  db.close();

  return progress;
};
