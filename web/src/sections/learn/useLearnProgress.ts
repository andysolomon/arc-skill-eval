import { useCallback, useEffect, useMemo, useState } from 'react';
import { openDatabase, requestToPromise, transactionDone } from '@/persistence/db';

const LEARN_READER_PROGRESS_ID = 'learn-reader';

export type LearnProgressState = {
  currentChapterId: string;
  scrollPos: number;
  completedSteps: string[];
};

type LearnProgressRecord = LearnProgressState & {
  chapterId: typeof LEARN_READER_PROGRESS_ID;
  updatedAt: string;
};

const defaultProgress = (chapterId: string): LearnProgressState => ({
  currentChapterId: chapterId,
  scrollPos: 0,
  completedSteps: [],
});

const isLearnProgressRecord = (value: unknown): value is LearnProgressRecord => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LearnProgressRecord>;
  return (
    candidate.chapterId === LEARN_READER_PROGRESS_ID &&
    typeof candidate.currentChapterId === 'string' &&
    typeof candidate.scrollPos === 'number' &&
    Array.isArray(candidate.completedSteps) &&
    candidate.completedSteps.every((step) => typeof step === 'string')
  );
};

const readProgress = async (initialChapterId: string): Promise<LearnProgressState> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readonly');
  const done = transactionDone(tx);
  const record = await requestToPromise<unknown>(
    tx.objectStore('learnProgress').get(LEARN_READER_PROGRESS_ID),
  );
  await done;
  db.close();

  return isLearnProgressRecord(record) ? record : defaultProgress(initialChapterId);
};

const writeProgress = async (progress: LearnProgressState): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction('learnProgress', 'readwrite');
  const done = transactionDone(tx);

  await requestToPromise(
    tx.objectStore('learnProgress').put({
      chapterId: LEARN_READER_PROGRESS_ID,
      ...progress,
      updatedAt: new Date().toISOString(),
    } satisfies LearnProgressRecord),
  );
  await done;
  db.close();
};

export const useLearnProgress = (initialChapterId: string) => {
  const [progress, setProgress] = useState<LearnProgressState>(() =>
    defaultProgress(initialChapterId),
  );
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void readProgress(initialChapterId)
      .then((record) => {
        if (!cancelled) {
          setProgress(record);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialChapterId]);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      void writeProgress(progress);
    }, 150);

    return () => window.clearTimeout(timeout);
  }, [hydrated, progress]);

  const setCurrentChapterId = useCallback((chapterId: string) => {
    setProgress((current) => ({
      ...current,
      currentChapterId: chapterId,
      scrollPos: current.currentChapterId === chapterId ? current.scrollPos : 0,
    }));
  }, []);

  const setScrollPos = useCallback((scrollPos: number) => {
    setProgress((current) => ({
      ...current,
      scrollPos,
    }));
  }, []);

  const markCompleted = useCallback((chapterId: string) => {
    setProgress((current) => {
      if (current.completedSteps.includes(chapterId)) {
        return current;
      }

      return {
        ...current,
        completedSteps: [...current.completedSteps, chapterId],
      };
    });
  }, []);

  return useMemo(
    () => ({
      ...progress,
      hydrated,
      markCompleted,
      setCurrentChapterId,
      setScrollPos,
    }),
    [hydrated, markCompleted, progress, setCurrentChapterId, setScrollPos],
  );
};
