import { useCallback, useEffect, useMemo, useState } from 'react';
import { openDatabase, requestToPromise, subscribeHostedDataReset, transactionDone } from '@/persistence/db';
import { addFeedback, type FeedbackRecord } from '@/persistence/feedback';
import type { ImprovePlanRecord } from '@/persistence/improvePlans';
import { getPrefs, setPrefs } from '@/persistence/preferences';

export type ReviewCaseStatus = 'pass' | 'fail' | 'partial' | 'timeout';

export type ReviewCase = {
  id: string;
  prompt: string;
  status: ReviewCaseStatus;
  output?: string;
  failureEvidence?: string;
};

export type ReviewRun = {
  id: string;
  skill: string;
  workspaceRoot: string;
  evalsJson?: unknown;
  finishedAt: string;
  status?: ReviewCaseStatus;
  cost?: number;
  exitCode?: number;
  cases: ReviewCase[];
};

type ImportedRunsPayload = {
  runs?: unknown;
};

let importedRuns: ReviewRun[] = [];
const importedRunsEvents = new EventTarget();

const emitImportedRunsChange = () => {
  importedRunsEvents.dispatchEvent(new Event('change'));
};

const toRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const normalizeCaseStatus = (value: unknown): ReviewCaseStatus => {
  if (value === 'fail' || value === 'failed' || value === 'FAIL') {
    return 'fail';
  }

  if (value === 'timeout' || value === 'TIMEOUT') {
    return 'timeout';
  }

  if (value === 'partial' || value === 'PARTIAL') {
    return 'partial';
  }

  return 'pass';
};

const normalizeRunStatus = (
  value: unknown,
  cases: ReviewCase[],
): ReviewCaseStatus => {
  if (value) {
    return normalizeCaseStatus(value);
  }

  if (cases.some((testCase) => testCase.status === 'fail')) {
    return 'fail';
  }

  if (cases.some((testCase) => testCase.status === 'timeout')) {
    return 'timeout';
  }

  if (cases.some((testCase) => testCase.status === 'partial')) {
    return 'partial';
  }

  return 'pass';
};

const normalizeCase = (value: unknown, index: number): ReviewCase => {
  const record = toRecord(value);

  if (!record) {
    throw new Error('Each run case must be an object.');
  }

  return {
    id: asString(record.id ?? record.caseId, `case-${index + 1}`),
    prompt: asString(record.prompt ?? record.promptExcerpt, 'No prompt recorded.'),
    status: normalizeCaseStatus(record.status ?? record.deltaTag),
    output: typeof record.output === 'string' ? record.output : undefined,
    failureEvidence:
      typeof record.failureEvidence === 'string'
        ? record.failureEvidence
        : typeof record.failureEvidenceBlock === 'string'
          ? record.failureEvidenceBlock
          : undefined,
  };
};

const normalizeRun = (value: unknown, index: number): ReviewRun => {
  const record = toRecord(value);

  if (!record) {
    throw new Error('Each run must be an object.');
  }

  const rawCases = Array.isArray(record.cases) ? record.cases : [];
  const cases = rawCases.map((testCase, caseIndex) => normalizeCase(testCase, caseIndex));

  return {
    id: asString(record.id ?? record.runId, `run-${index + 1}`),
    skill: asString(record.skill ?? record.skillName, 'unknown-skill'),
    workspaceRoot: asString(record.workspaceRoot ?? record.skillPath, ''),
    evalsJson:
      record.evalsJson ??
      record.evals_json ??
      record.evalSuite ??
      record.suite ??
      { evals: cases.map(({ id, prompt }) => ({ id, prompt })) },
    finishedAt: asString(record.finishedAt, new Date().toISOString()),
    status: normalizeRunStatus(record.status, cases),
    cost: asNumber(record.cost),
    exitCode: asNumber(record.exitCode),
    cases,
  };
};

export const parseReviewRuns = (text: string): ReviewRun[] => {
  const parsed = JSON.parse(text) as ImportedRunsPayload;
  const record = toRecord(parsed);
  const rawRuns = Array.isArray(record?.runs) ? record.runs : [parsed];
  const runs = rawRuns.map((run, index) => normalizeRun(run, index));

  if (runs.length === 0 || runs.every((run) => run.cases.length === 0)) {
    throw new Error('Import must include at least one run with cases.');
  }

  return runs;
};

const readFeedback = async (): Promise<FeedbackRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction('feedback', 'readonly');
  const done = transactionDone(tx);
  const records = await requestToPromise<FeedbackRecord[]>(
    tx.objectStore('feedback').getAll(),
  );
  await done;
  db.close();

  return records;
};

const readImprovePlans = async (): Promise<ImprovePlanRecord[]> => {
  const db = await openDatabase();
  const tx = db.transaction('improvePlans', 'readonly');
  const done = transactionDone(tx);
  const records = await requestToPromise<ImprovePlanRecord[]>(
    tx.objectStore('improvePlans').getAll(),
  );
  await done;
  db.close();

  return records;
};

const deleteFeedback = async (noteId: string): Promise<void> => {
  const db = await openDatabase();
  const tx = db.transaction('feedback', 'readwrite');
  const done = transactionDone(tx);

  tx.objectStore('feedback').delete(noteId);
  await done;
  db.close();
};

export const createSampleReviewRun = (): ReviewRun => ({
  id: 'sample-review-run',
  skill: 'sample-skill',
  workspaceRoot: './sample-skill',
  evalsJson: {
    evals: [
      {
        id: 'case-pass',
        prompt: 'Summarize the notes into a concise project update.',
      },
      {
        id: 'case-fail',
        prompt: 'Flag missing acceptance criteria before creating implementation work.',
      },
    ],
  },
  finishedAt: new Date().toISOString(),
  status: 'fail',
  exitCode: 1,
  cases: [
    {
      id: 'case-pass',
      prompt: 'Summarize the notes into a concise project update.',
      status: 'pass',
      output: 'The skill produced a focused summary with the expected sections.',
    },
    {
      id: 'case-fail',
      prompt: 'Flag missing acceptance criteria before creating implementation work.',
      status: 'fail',
      output: 'The response skipped the checklist and moved directly to code.',
      failureEvidence:
        'assistant.md: missing acceptance criteria; assertion expected a checklist before implementation.',
    },
  ],
});

export const useReviewData = () => {
  const [runs, setRuns] = useState<ReviewRun[]>(importedRuns);
  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [improvePlans, setImprovePlans] = useState<ImprovePlanRecord[]>([]);
  const [lastRunId, setLastRunId] = useState<string | undefined>();

  const refreshFeedback = useCallback(async () => {
    setFeedback(await readFeedback());
  }, []);

  const refreshImprovePlans = useCallback(async () => {
    setImprovePlans(await readImprovePlans());
  }, []);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([readFeedback(), readImprovePlans(), getPrefs()]).then(
      ([feedbackRecords, planRecords, prefs]) => {
        if (!cancelled) {
          setFeedback(feedbackRecords);
          setImprovePlans(planRecords);
          setLastRunId(prefs.lastRunId);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleImportedRunsChange = () => setRuns([...importedRuns]);
    const unsubscribeReset = subscribeHostedDataReset(() => {
      importedRuns = [];
      emitImportedRunsChange();
      setFeedback([]);
      setImprovePlans([]);
      setLastRunId(undefined);
    });

    importedRunsEvents.addEventListener('change', handleImportedRunsChange);

    return () => {
      importedRunsEvents.removeEventListener('change', handleImportedRunsChange);
      unsubscribeReset();
    };
  }, []);

  const importRuns = useCallback(async (nextRuns: ReviewRun[]) => {
    importedRuns = nextRuns;
    emitImportedRunsChange();

    const importedRunId = nextRuns[0]?.id;
    if (importedRunId) {
      setLastRunId(importedRunId);
      await setPrefs({ lastRunId: importedRunId });
    }
  }, []);

  const recordFeedback = useCallback(
    async (runId: string, caseId: string | undefined, note: string) => {
      await addFeedback({ runId, caseId, note });
      await refreshFeedback();
    },
    [refreshFeedback],
  );

  const removeFeedback = useCallback(
    async (noteId: string) => {
      await deleteFeedback(noteId);
      await refreshFeedback();
    },
    [refreshFeedback],
  );

  const feedbackByRun = useMemo(() => {
    const byRun = new Map<string, FeedbackRecord[]>();

    feedback.forEach((record) => {
      const records = byRun.get(record.runId) ?? [];
      records.push(record);
      byRun.set(record.runId, records);
    });

    byRun.forEach((records) => {
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });

    return byRun;
  }, [feedback]);

  const improvePlansByRun = useMemo(() => {
    const byRun = new Map<string, ImprovePlanRecord[]>();

    improvePlans.forEach((record) => {
      const records = byRun.get(record.runId) ?? [];
      records.push(record);
      byRun.set(record.runId, records);
    });

    byRun.forEach((records) => {
      records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });

    return byRun;
  }, [improvePlans]);

  return {
    feedbackByRun,
    importRuns,
    lastRunId,
    parseReviewRuns,
    recordFeedback,
    removeFeedback,
    runs,
    createSampleReviewRun,
    improvePlansByRun,
  };
};
