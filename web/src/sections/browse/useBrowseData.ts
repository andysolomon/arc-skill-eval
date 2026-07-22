import { useMemo } from 'react';
import { useReviewData, type ReviewCase, type ReviewRun } from '@/sections/review/useReviewData';

export type BrowseTab = 'overview' | 'response' | 'diff' | 'trace' | 'raw';
export type BrowseVariant = 'with_skill' | 'without_skill';

export type BrowseMetrics = {
  tokens: number;
  costUsd: number;
  latencyMs: number;
  msPerCase: number;
};

export type BrowseTraceTurn = {
  id: string;
  label: string;
  summary: string;
  status: ReviewCase['status'];
};

export type BrowseCase = ReviewCase & {
  deltaTag: 'PASS' | 'FAIL' | 'TIMEOUT';
  expected: string;
  response: string;
  metrics: BrowseMetrics;
  trace: BrowseTraceTurn[];
  raw: Record<string, unknown>;
};

export type BrowseRun = Omit<ReviewRun, 'cases'> & {
  benchmarkDelta?: number;
  compare: boolean;
  cases: BrowseCase[];
};

const statusToDeltaTag = (status: ReviewCase['status']): BrowseCase['deltaTag'] => {
  if (status === 'fail') {
    return 'FAIL';
  }

  if (status === 'timeout') {
    return 'TIMEOUT';
  }

  return 'PASS';
};

const readOptionalNumber = (record: Record<string, unknown>, keys: string[]) => {
  const value = keys.map((key) => record[key]).find((candidate) => typeof candidate === 'number');
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const readCompareFlag = (run: ReviewRun) => {
  const record = run as ReviewRun & Record<string, unknown>;
  return record.compare === true || record.compareMode === 'on' || record.benchmark !== undefined;
};

const createMetrics = (
  run: ReviewRun,
  testCase: ReviewCase,
  index: number,
  totalCases: number,
): BrowseMetrics => {
  const runRecord = run as ReviewRun & Record<string, unknown>;
  const caseRecord = testCase as ReviewCase & Record<string, unknown>;
  const response = testCase.output ?? '';
  const tokens =
    readOptionalNumber(caseRecord, ['tokens', 'totalTokens']) ??
    Math.max(240, Math.round((testCase.prompt.length + response.length) / 3));
  const latencyMs =
    readOptionalNumber(caseRecord, ['latencyMs', 'durationMs']) ?? 1800 + index * 420;
  const costUsd =
    readOptionalNumber(caseRecord, ['cost', 'costUsd']) ??
    (run.cost ? run.cost / Math.max(1, totalCases) : tokens * 0.000002);

  return {
    tokens,
    costUsd,
    latencyMs,
    msPerCase: Math.round(latencyMs / Math.max(1, totalCases)),
  };
};

const createTrace = (testCase: ReviewCase): BrowseTraceTurn[] => [
  {
    id: `${testCase.id}-context`,
    label: 'context manifest',
    summary: 'Loaded skill instructions and eval case inputs from the imported artifact shape.',
    status: 'pass',
  },
  {
    id: `${testCase.id}-assistant`,
    label: 'assistant response',
    summary: testCase.output ?? 'No assistant.md text was included with this imported case.',
    status: testCase.output ? 'pass' : 'partial',
  },
  {
    id: `${testCase.id}-grading`,
    label: 'grading summary',
    summary: testCase.failureEvidence ?? `Case recorded as ${testCase.status}.`,
    status: testCase.status,
  },
];

const toBrowseCase = (
  run: ReviewRun,
  testCase: ReviewCase,
  index: number,
): BrowseCase => {
  const metrics = createMetrics(run, testCase, index, run.cases.length);
  const expected =
    testCase.status === 'pass'
      ? 'Assertions passed with concrete evidence.'
      : 'Assertions expected the assistant response to satisfy the case prompt.';
  const response = testCase.output ?? 'assistant.md is not present in this imported run.';

  return {
    ...testCase,
    deltaTag: statusToDeltaTag(testCase.status),
    expected,
    metrics,
    raw: {
      caseId: testCase.id,
      grading: {
        summary: testCase.status,
        evidence: testCase.failureEvidence ?? testCase.output ?? null,
      },
      metrics,
      prompt: testCase.prompt,
      response,
    },
    response,
    trace: createTrace(testCase),
  };
};

const countStatus = (run: ReviewRun, status: ReviewCase['status']) =>
  run.cases.filter((testCase) => testCase.status === status).length;

const toBrowseRun = (run: ReviewRun): BrowseRun => {
  const record = run as ReviewRun & Record<string, unknown>;
  const benchmarkDelta = readOptionalNumber(record, ['benchmarkDelta', 'delta', 'deltaPct']);

  return {
    ...run,
    benchmarkDelta,
    compare: readCompareFlag(run),
    cases: run.cases.map((testCase, index) => toBrowseCase(run, testCase, index)),
  };
};

export const useBrowseData = () => {
  const { runs } = useReviewData();

  return useMemo(() => {
    const browseRuns = runs.map(toBrowseRun);

    return {
      runs: browseRuns,
      summaryByRun: new Map(
        browseRuns.map((run) => [
          run.id,
          {
            pass: countStatus(run, 'pass'),
            fail: countStatus(run, 'fail'),
            timeout: countStatus(run, 'timeout'),
          },
        ]),
      ),
    };
  }, [runs]);
};
