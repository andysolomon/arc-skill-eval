import { openDatabase, requestToPromise, transactionDone } from './db';

const LEARN_READER_PROGRESS_ID = 'learn-reader';

export type LearnReaderProgress = {
  currentChapterId: string;
  scrollPos: number;
  completedSteps: string[];
};

type LearnReaderRecord = LearnReaderProgress & {
  chapterId: typeof LEARN_READER_PROGRESS_ID;
  updatedAt: string;
};

const isLearnReaderRecord = (value: unknown): value is LearnReaderRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LearnReaderRecord>;
  return (
    candidate.chapterId === LEARN_READER_PROGRESS_ID &&
    typeof candidate.currentChapterId === 'string' &&
    typeof candidate.scrollPos === 'number' &&
    Array.isArray(candidate.completedSteps) &&
    candidate.completedSteps.every((step) => typeof step === 'string')
  );
};

export const getLearnReaderProgress = async (): Promise<LearnReaderProgress | undefined> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<unknown>(tx.objectStore('learnProgress').get(LEARN_READER_PROGRESS_ID));
  await done;
  db.close();

  return isLearnReaderRecord(record)
    ? { currentChapterId: record.currentChapterId, scrollPos: record.scrollPos, completedSteps: record.completedSteps }
    : undefined;
};

export const putLearnReaderProgress = async (progress: LearnReaderProgress, updatedAt: string): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readwrite');
  const done = transactionDone(tx);

  await requestToPromise(
    tx.objectStore('learnProgress').put({
      chapterId: LEARN_READER_PROGRESS_ID,
      ...progress,
      updatedAt,
    } satisfies LearnReaderRecord),
  );
  await done;
  db.close();
};
