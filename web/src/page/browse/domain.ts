import { Array, Option, Schema } from 'effect';

import type { ReviewRun } from '@/page/review/domain';

import { finiteNumber, jsonRecord, maybeString, unknownList, type UnknownRecord } from './json';

export const CaseStatus = Schema.Literals(['pass', 'fail', 'partial', 'timeout']);
export type CaseStatus = typeof CaseStatus.Type;

export const DeltaTag = Schema.Literals(['PASS', 'FAIL', 'TIMEOUT']);
export type DeltaTag = typeof DeltaTag.Type;

export const Tab = Schema.Literals(['overview', 'response', 'diff', 'trace', 'raw']);
export type Tab = typeof Tab.Type;

export const Variant = Schema.Literals(['with_skill', 'without_skill']);
export type Variant = typeof Variant.Type;

export const Metrics = Schema.Struct({
  tokens: Schema.Number,
  costUsd: Schema.Number,
  latencyMs: Schema.Number,
  msPerCase: Schema.Number,
});
export type Metrics = typeof Metrics.Type;

export const Case = Schema.Struct({
  id: Schema.String,
  prompt: Schema.String,
  status: CaseStatus,
  maybeOutput: Schema.Option(Schema.String),
  maybeFailureEvidence: Schema.Option(Schema.String),
  metrics: Metrics,
});
export type Case = typeof Case.Type;

export const Run = Schema.Struct({
  id: Schema.String,
  skill: Schema.String,
  workspaceRoot: Schema.String,
  finishedAt: Schema.String,
  maybeStatus: Schema.Option(CaseStatus),
  compare: Schema.Boolean,
  maybeBenchmarkDelta: Schema.Option(Schema.Number),
  cases: Schema.Array(Case),
});
export type Run = typeof Run.Type;

export const tabs: ReadonlyArray<Readonly<{ id: Tab; label: string }>> = [
  { id: 'overview', label: 'Overview' },
  { id: 'response', label: 'Response' },
  { id: 'diff', label: 'Diff' },
  { id: 'trace', label: 'Trace' },
  { id: 'raw', label: 'Raw' },
];

export const variants: ReadonlyArray<Variant> = ['with_skill', 'without_skill'];

const nonEmptyString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' && value.trim().length > 0 ? Option.some(value) : Option.none();

const readOptionalNumber = (record: UnknownRecord, keys: ReadonlyArray<string>): Option.Option<number> =>
  Array.findFirst(keys, (key) => typeof record[key] === 'number').pipe(
    Option.flatMap((key) => finiteNumber(record[key])),
  );

const toCaseStatus = (value: unknown): CaseStatus => {
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

type RecordedMetrics = Readonly<{
  maybeTokens: Option.Option<number>;
  maybeLatencyMs: Option.Option<number>;
  maybeCostUsd: Option.Option<number>;
}>;

const noRecordedMetrics: RecordedMetrics = {
  maybeTokens: Option.none(),
  maybeLatencyMs: Option.none(),
  maybeCostUsd: Option.none(),
};

const toMetrics = (
  recorded: RecordedMetrics,
  prompt: string,
  maybeOutput: Option.Option<string>,
  maybeRunCost: Option.Option<number>,
  index: number,
  totalCases: number,
): Metrics => {
  const response = Option.getOrElse(maybeOutput, () => '');
  const tokens = Option.getOrElse(recorded.maybeTokens, () =>
    Math.max(240, Math.round((prompt.length + response.length) / 3)),
  );
  const latencyMs = Option.getOrElse(recorded.maybeLatencyMs, () => 1800 + index * 420);
  const costUsd = Option.getOrElse(recorded.maybeCostUsd, () =>
    Option.match(Option.filter(maybeRunCost, (cost) => cost !== 0), {
      onNone: () => tokens * 0.000002,
      onSome: (cost) => cost / Math.max(1, totalCases),
    }),
  );
  return { tokens, costUsd, latencyMs, msPerCase: Math.round(latencyMs / Math.max(1, totalCases)) };
};

const toCase =
  (maybeRunCost: Option.Option<number>, totalCases: number) =>
  (value: unknown, index: number): Option.Option<Case> =>
    Option.map(jsonRecord(value), (record) => {
      const prompt = Option.getOrElse(nonEmptyString(record.prompt ?? record.promptExcerpt), () => 'No prompt recorded.');
      const maybeOutput = maybeString(record.output);
      return {
        id: Option.getOrElse(nonEmptyString(record.id ?? record.caseId), () => `case-${index + 1}`),
        prompt,
        status: toCaseStatus(record.status ?? record.deltaTag),
        maybeOutput,
        maybeFailureEvidence: Option.orElse(maybeString(record.failureEvidence), () =>
          maybeString(record.failureEvidenceBlock),
        ),
        metrics: toMetrics(
          {
            maybeTokens: readOptionalNumber(record, ['tokens', 'totalTokens']),
            maybeLatencyMs: readOptionalNumber(record, ['latencyMs', 'durationMs']),
            maybeCostUsd: readOptionalNumber(record, ['cost', 'costUsd']),
          },
          prompt,
          maybeOutput,
          maybeRunCost,
          index,
          totalCases,
        ),
      };
    });

const toRun = (value: unknown): Option.Option<Run> =>
  jsonRecord(value).pipe(
    Option.filter((record) => typeof record.id === 'string'),
    Option.map((record) => {
      const rawCases = unknownList(record.cases);
      const maybeCost = finiteNumber(record.cost);
      return {
        id: String(record.id),
        skill: Option.getOrElse(nonEmptyString(record.skill ?? record.skillName), () => 'unknown-skill'),
        workspaceRoot: Option.getOrElse(maybeString(record.workspaceRoot ?? record.skillPath), () => ''),
        finishedAt: Option.getOrElse(maybeString(record.finishedAt), () => ''),
        maybeStatus: record.status === undefined || record.status === null ? Option.none() : Option.some(toCaseStatus(record.status)),
        compare: record.compare === true || record.compareMode === 'on' || record.benchmark !== undefined,
        maybeBenchmarkDelta: readOptionalNumber(record, ['benchmarkDelta', 'delta', 'deltaPct']),
        cases: Array.getSomes(Array.map(rawCases, toCase(maybeCost, rawCases.length))),
      };
    }),
  );

const decodeRuns = (values: ReadonlyArray<unknown>): ReadonlyArray<Run> => Array.getSomes(Array.map(values, toRun));

export const decodeRunsPayload = (payload: unknown): ReadonlyArray<Run> =>
  Option.match(jsonRecord(payload), {
    onNone: () => [],
    onSome: (record) => decodeRuns(unknownList(record.runs)),
  });

export const fromReviewRun = (run: ReviewRun): Run => ({
  id: run.id,
  skill: run.skill,
  workspaceRoot: run.workspaceRoot,
  finishedAt: run.finishedAt,
  maybeStatus: run.maybeStatus,
  compare: false,
  maybeBenchmarkDelta: Option.none(),
  cases: Array.map(run.cases, (testCase, index) => ({
    id: testCase.id,
    prompt: testCase.prompt,
    status: testCase.status,
    maybeOutput: testCase.maybeOutput,
    maybeFailureEvidence: testCase.maybeFailureEvidence,
    metrics: toMetrics(noRecordedMetrics, testCase.prompt, testCase.maybeOutput, run.maybeCost, index, run.cases.length),
  })),
});

export const deltaTag = (status: CaseStatus): DeltaTag =>
  status === 'fail' ? 'FAIL' : status === 'timeout' ? 'TIMEOUT' : 'PASS';

export const expectedText = (testCase: Case): string =>
  testCase.status === 'pass'
    ? 'Assertions passed with concrete evidence.'
    : 'Assertions expected the assistant response to satisfy the case prompt.';

export const responseText = (testCase: Case): string =>
  Option.getOrElse(testCase.maybeOutput, () => 'assistant.md is not present in this imported run.');

export type TraceTurn = Readonly<{ id: string; label: string; summary: string; status: CaseStatus }>;

export const traceTurns = (testCase: Case): ReadonlyArray<TraceTurn> => [
  {
    id: `${testCase.id}-context`,
    label: 'context manifest',
    summary: 'Loaded skill instructions and eval case inputs from the imported artifact shape.',
    status: 'pass',
  },
  {
    id: `${testCase.id}-assistant`,
    label: 'assistant response',
    summary: Option.getOrElse(testCase.maybeOutput, () => 'No assistant.md text was included with this imported case.'),
    status: Option.exists(testCase.maybeOutput, (output) => output !== '') ? 'pass' : 'partial',
  },
  {
    id: `${testCase.id}-grading`,
    label: 'grading summary',
    summary: Option.getOrElse(testCase.maybeFailureEvidence, () => `Case recorded as ${testCase.status}.`),
    status: testCase.status,
  },
];

export const fallbackRawJson = (run: Run, testCase: Case, variant: Variant): string =>
  JSON.stringify(
    {
      case: {
        caseId: testCase.id,
        grading: {
          summary: testCase.status,
          evidence: Option.getOrNull(Option.orElse(testCase.maybeFailureEvidence, () => testCase.maybeOutput)),
        },
        metrics: testCase.metrics,
        prompt: testCase.prompt,
        response: responseText(testCase),
      },
      run: {
        benchmarkDelta: Option.getOrNull(run.maybeBenchmarkDelta),
        compare: run.compare,
        id: run.id,
        skill: run.skill,
      },
      variant,
    },
    null,
    2,
  );

export const countStatus = (cases: ReadonlyArray<Case>, status: CaseStatus): number =>
  Array.filter(cases, (testCase) => testCase.status === status).length;

export const defaultCase = (run: Run): Option.Option<Case> =>
  Option.orElse(
    Array.findFirst(run.cases, (testCase) => testCase.status === 'fail'),
    () => Array.head(run.cases),
  );
