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
  withPassed?: number;
  withTotal?: number;
  withoutPassed?: number;
  withoutTotal?: number;
  delta?: string;
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

const asCompareCounts = (value: unknown): { passed?: number; total?: number } => {
  const record = toRecord(value);

  return {
    passed: asNumber(record?.passed),
    total: asNumber(record?.total),
  };
};

const normalizeCase = (value: unknown, index: number): ReviewCase => {
  const record = toRecord(value);

  if (!record) {
    throw new Error('Each run case must be an object.');
  }

  const withCounts = asCompareCounts(record.withSkill ?? record.with_skill ?? record.with);
  const withoutCounts = asCompareCounts(
    record.withoutSkill ?? record.without_skill ?? record.without,
  );

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
    withPassed: asNumber(record.withPassed) ?? withCounts.passed,
    withTotal: asNumber(record.withTotal) ?? withCounts.total,
    withoutPassed: asNumber(record.withoutPassed) ?? withoutCounts.passed,
    withoutTotal: asNumber(record.withoutTotal) ?? withoutCounts.total,
    delta: typeof record.delta === 'string' ? record.delta : undefined,
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

export type ImportCheck = { ok: boolean; label: string };

export type ReviewImportInspection = {
  ok: boolean;
  kind: string;
  summary: string;
  checks: ImportCheck[];
  advisories: ImportCheck[];
  error: string;
  runs?: ReviewRun[];
};

const inspectSuite = (record: Record<string, unknown>): ReviewImportInspection => {
  const checks: ImportCheck[] = [];
  const add = (ok: boolean, label: string) => checks.push({ ok, label });
  const hasName = typeof record.skill_name === 'string' && record.skill_name.trim().length > 0;

  add(hasName, 'has a skill_name');

  const evals = Array.isArray(record.evals) ? record.evals : [];
  add(evals.length > 0, 'has at least one eval case');

  let allPrompts = evals.length > 0;
  let allAsserts = evals.length > 0;
  let wellFormed = evals.length > 0;
  let anyDeterministic = false;
  let anyNegative = false;

  evals.forEach((rawCase) => {
    const caseRecord = toRecord(rawCase);

    if (typeof caseRecord?.prompt !== 'string' || !caseRecord.prompt.trim()) {
      allPrompts = false;
    }

    const assertions = Array.isArray(caseRecord?.assertions) ? caseRecord.assertions : [];
    if (assertions.length === 0) {
      allAsserts = false;
    }

    assertions.forEach((assertion) => {
      if (typeof assertion === 'string') {
        return;
      }

      const assertionRecord = toRecord(assertion);
      if (typeof assertionRecord?.type !== 'string') {
        wellFormed = false;
      } else if (assertionRecord.type !== 'judge') {
        anyDeterministic = true;
      }
    });

    if (/absent|negative|no release|docs-only|should not/i.test(JSON.stringify(rawCase ?? ''))) {
      anyNegative = true;
    }
  });

  add(allPrompts, 'every case has a prompt');
  add(allAsserts, 'every case has ≥1 assertion');
  add(wellFormed, 'assertions are well-formed');

  const ok = checks.every((check) => check.ok);

  return {
    ok,
    kind: 'evals.json · suite',
    summary: `${evals.length} cases · ${asString(record.skill_name, '?')}`,
    checks,
    advisories: [
      { ok: anyDeterministic, label: 'uses deterministic checks, not only judge' },
      { ok: anyNegative, label: 'includes an adjacent-negative case' },
    ],
    error: '',
  };
};

export const inspectReviewArtifact = (text: string): ReviewImportInspection => {
  let parsed: unknown = null;
  let parseError = '';

  try {
    parsed = JSON.parse(text);
  } catch (error) {
    parseError = `not valid JSON — ${error instanceof Error ? error.message : String(error)}`;
  }

  const record = toRecord(parsed);

  if (!record) {
    return {
      ok: false,
      kind: '',
      summary: '',
      checks: [{ ok: false, label: 'parses as JSON' }],
      advisories: [],
      error: parseError || 'not a JSON object',
    };
  }

  if (Array.isArray(record.runs) || Array.isArray(record.cases)) {
    try {
      const runs = parseReviewRuns(text);
      const caseCount = runs.reduce((total, run) => total + run.cases.length, 0);

      return {
        ok: true,
        kind: 'run results',
        summary: `${caseCount} cases · ${runs[0]?.skill ?? '?'}`,
        checks: [
          { ok: true, label: 'parses as JSON' },
          { ok: true, label: 'recognized as run results' },
        ],
        advisories: [],
        error: '',
        runs,
      };
    } catch (error) {
      return {
        ok: false,
        kind: 'run results',
        summary: '',
        checks: [
          { ok: true, label: 'parses as JSON' },
          { ok: false, label: 'run results are well-formed' },
        ],
        advisories: [],
        error: error instanceof Error ? error.message : 'run results could not be parsed',
      };
    }
  }

  if (Array.isArray(record.evals)) {
    return inspectSuite(record);
  }

  let kind = '';
  let summary = '';

  if (Array.isArray(record.assertion_results) || record.summary) {
    kind = 'grading.json';
    const summaryRecord = toRecord(record.summary) ?? {};
    summary =
      (summaryRecord.passed != null
        ? `${summaryRecord.passed}/${summaryRecord.total ?? '?'} passed`
        : 'per-assertion results') + (record.case_id ? ` · ${record.case_id}` : '');
  } else if (record.delta != null || (record.with != null && record.without != null)) {
    kind = 'benchmark.json';
    summary = `with ${record.with ?? '?'} · without ${record.without ?? '?'} · Δ ${record.delta ?? '?'}`;
  } else if (record.duration_ms != null || record.tokens != null || record.cost != null) {
    kind = 'timing.json';
    summary =
      [
        record.duration_ms != null ? `${record.duration_ms}ms` : null,
        record.cost != null ? `$${record.cost}` : null,
      ]
        .filter(Boolean)
        .join(' · ') || 'duration & cost';
  } else if (Array.isArray(record.notes) || record.feedback != null) {
    kind = 'feedback.json';
    summary = Array.isArray(record.notes) ? `${record.notes.length} notes` : 'review notes';
  }

  const ok = kind.length > 0;

  return {
    ok,
    kind: ok ? kind : 'unrecognized',
    summary,
    checks: [
      { ok: true, label: 'parses as JSON' },
      { ok, label: ok ? `recognized as ${kind}` : 'a recognized arc-skill-eval artifact' },
    ],
    advisories: [],
    error: ok ? '' : 'not a recognized arc-skill-eval JSON file',
  };
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
  cost: 0.41,
  exitCode: 1,
  cases: [
    {
      id: 'case-pass',
      prompt: 'Summarize the notes into a concise project update.',
      status: 'pass',
      output: 'The skill produced a focused summary with the expected sections.',
      withPassed: 3,
      withTotal: 3,
      withoutPassed: 1,
      withoutTotal: 3,
    },
    {
      id: 'case-fail',
      prompt: 'Flag missing acceptance criteria before creating implementation work.',
      status: 'fail',
      output: 'The response skipped the checklist and moved directly to code.',
      failureEvidence:
        'assistant.md: missing acceptance criteria; assertion expected a checklist before implementation.',
      withPassed: 0,
      withTotal: 1,
      withoutPassed: 0,
      withoutTotal: 1,
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
