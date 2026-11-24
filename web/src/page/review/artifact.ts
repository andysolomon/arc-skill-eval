import { Array, Option, Result } from 'effect';

import type { ImportCheck, Inspection, ReviewCase, ReviewCaseStatus, ReviewRun } from './domain';

type JsonRecord = Readonly<Record<string, unknown>>;

const toRecord = (value: unknown): Option.Option<JsonRecord> =>
  value !== null && typeof value === 'object' && !globalThis.Array.isArray(value)
    ? Option.some(value as JsonRecord)
    : Option.none();

const asArray = (value: unknown): ReadonlyArray<unknown> => (globalThis.Array.isArray(value) ? value : []);

const asString = (value: unknown, fallback: string): string =>
  typeof value === 'string' && value.trim().length > 0 ? value : fallback;

const maybeNumber = (value: unknown): Option.Option<number> =>
  typeof value === 'number' && Number.isFinite(value) ? Option.some(value) : Option.none();

const maybeString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' ? Option.some(value) : Option.none();

const isPresent = (value: unknown): boolean => value !== null && value !== undefined;

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

const hasStatus = (cases: ReadonlyArray<ReviewCase>, status: ReviewCaseStatus): boolean =>
  Array.some(cases, (testCase) => testCase.status === status);

const normalizeRunStatus = (value: unknown, cases: ReadonlyArray<ReviewCase>): ReviewCaseStatus => {
  if (value) {
    return normalizeCaseStatus(value);
  }
  if (hasStatus(cases, 'fail')) {
    return 'fail';
  }
  if (hasStatus(cases, 'timeout')) {
    return 'timeout';
  }
  if (hasStatus(cases, 'partial')) {
    return 'partial';
  }
  return 'pass';
};

const compareCounts = (value: unknown): { maybePassed: Option.Option<number>; maybeTotal: Option.Option<number> } =>
  Option.match(toRecord(value), {
    onNone: () => ({ maybePassed: Option.none(), maybeTotal: Option.none() }),
    onSome: (record) => ({ maybePassed: maybeNumber(record.passed), maybeTotal: maybeNumber(record.total) }),
  });

const normalizeCase = (value: unknown, index: number): Result.Result<ReviewCase, string> =>
  Option.match(toRecord(value), {
    onNone: () => Result.fail('Each run case must be an object.'),
    onSome: (record) => {
      const withCounts = compareCounts(record.withSkill ?? record.with_skill ?? record.with);
      const withoutCounts = compareCounts(record.withoutSkill ?? record.without_skill ?? record.without);
      return Result.succeed({
        id: asString(record.id ?? record.caseId, `case-${index + 1}`),
        prompt: asString(record.prompt ?? record.promptExcerpt, 'No prompt recorded.'),
        status: normalizeCaseStatus(record.status ?? record.deltaTag),
        maybeOutput: maybeString(record.output),
        maybeFailureEvidence: Option.orElse(maybeString(record.failureEvidence), () =>
          maybeString(record.failureEvidenceBlock),
        ),
        maybeWithPassed: Option.orElse(maybeNumber(record.withPassed), () => withCounts.maybePassed),
        maybeWithTotal: Option.orElse(maybeNumber(record.withTotal), () => withCounts.maybeTotal),
        maybeWithoutPassed: Option.orElse(maybeNumber(record.withoutPassed), () => withoutCounts.maybePassed),
        maybeWithoutTotal: Option.orElse(maybeNumber(record.withoutTotal), () => withoutCounts.maybeTotal),
        maybeDelta: maybeString(record.delta),
      });
    },
  });

const firstPresent = (values: ReadonlyArray<unknown>): Option.Option<unknown> => Array.findFirst(values, isPresent);

const normalizeRun = (value: unknown, index: number, nowIso: string): Result.Result<ReviewRun, string> =>
  Option.match(toRecord(value), {
    onNone: () => Result.fail('Each run must be an object.'),
    onSome: (record) =>
      Result.map(
        Result.all(Array.map(asArray(record.cases), (testCase, caseIndex) => normalizeCase(testCase, caseIndex))),
        (cases): ReviewRun => ({
          id: asString(record.id ?? record.runId, `run-${index + 1}`),
          skill: asString(record.skill ?? record.skillName, 'unknown-skill'),
          workspaceRoot: asString(record.workspaceRoot ?? record.skillPath, ''),
          maybeEvalsJson: Option.some(
            Option.getOrElse(
              firstPresent([record.evalsJson, record.evals_json, record.evalSuite, record.suite]),
              () => ({ evals: Array.map(cases, ({ id, prompt }) => ({ id, prompt })) }),
            ),
          ),
          finishedAt: asString(record.finishedAt, nowIso),
          maybeStatus: Option.some(normalizeRunStatus(record.status, cases)),
          maybeCost: maybeNumber(record.cost),
          maybeExitCode: maybeNumber(record.exitCode),
          cases,
        }),
      ),
  });

const parseRuns = (parsed: unknown, nowIso: string): Result.Result<ReadonlyArray<ReviewRun>, string> => {
  const rawRuns = Option.match(
    Option.filter(toRecord(parsed), (record) => globalThis.Array.isArray(record.runs)),
    {
      onNone: () => [parsed],
      onSome: (record) => asArray(record.runs),
    },
  );
  return Result.flatMap(
    Result.all(Array.map(rawRuns, (run, index) => normalizeRun(run, index, nowIso))),
    (runs) =>
      Array.isReadonlyArrayEmpty(runs) || Array.every(runs, (run) => Array.isReadonlyArrayEmpty(run.cases))
        ? Result.fail('Import must include at least one run with cases.')
        : Result.succeed(runs),
  );
};

export type InspectionOutcome = Readonly<{ inspection: Inspection; maybeRuns: Option.Option<ReadonlyArray<ReviewRun>> }>;

const inspected = (inspection: Inspection): InspectionOutcome => ({ inspection, maybeRuns: Option.none() });

const check = (ok: boolean, label: string): ImportCheck => ({ ok, label });

const NEGATIVE_CASE_PATTERN = /absent|negative|no release|docs-only|should not/i;

const inspectSuite = (record: JsonRecord): Inspection => {
  const evals = asArray(record.evals);
  const hasEvals = Array.isReadonlyArrayNonEmpty(evals);
  const caseRecords = Array.map(evals, toRecord);
  const assertionsOf = (caseRecord: Option.Option<JsonRecord>): ReadonlyArray<unknown> =>
    Option.match(caseRecord, { onNone: () => [], onSome: (found) => asArray(found.assertions) });
  const assertions = Array.flatMap(caseRecords, assertionsOf);
  const assertionType = (assertion: unknown): Option.Option<string> =>
    Option.flatMap(toRecord(assertion), (found) => maybeString(found.type));

  const checks = [
    check(typeof record.skill_name === 'string' && record.skill_name.trim().length > 0, 'has a skill_name'),
    check(hasEvals, 'has at least one eval case'),
    check(
      hasEvals &&
        Array.every(caseRecords, (caseRecord) =>
          Option.exists(caseRecord, (found) => typeof found.prompt === 'string' && found.prompt.trim().length > 0),
        ),
      'every case has a prompt',
    ),
    check(
      hasEvals && Array.every(caseRecords, (caseRecord) => Array.isReadonlyArrayNonEmpty(assertionsOf(caseRecord))),
      'every case has ≥1 assertion',
    ),
    check(
      hasEvals &&
        Array.every(
          assertions,
          (assertion) => typeof assertion === 'string' || Option.isSome(assertionType(assertion)),
        ),
      'assertions are well-formed',
    ),
  ];

  return {
    ok: Array.every(checks, (item) => item.ok),
    kind: 'evals.json · suite',
    summary: `${evals.length} cases · ${asString(record.skill_name, '?')}`,
    checks,
    advisories: [
      check(
        Array.some(
          assertions,
          (assertion) =>
            typeof assertion !== 'string' && Option.exists(assertionType(assertion), (type) => type !== 'judge'),
        ),
        'uses deterministic checks, not only judge',
      ),
      check(
        Array.some(evals, (rawCase) => NEGATIVE_CASE_PATTERN.test(JSON.stringify(rawCase ?? ''))),
        'includes an adjacent-negative case',
      ),
    ],
    error: '',
  };
};

const inspectRunResults = (parsed: unknown, nowIso: string): InspectionOutcome =>
  Result.match(parseRuns(parsed, nowIso), {
    onFailure: (error) =>
      inspected({
        ok: false,
        kind: 'run results',
        summary: '',
        checks: [check(true, 'parses as JSON'), check(false, 'run results are well-formed')],
        advisories: [],
        error,
      }),
    onSuccess: (runs) => ({
      inspection: {
        ok: true,
        kind: 'run results',
        summary: `${Array.reduce(runs, 0, (total, run) => total + run.cases.length)} cases · ${Option.match(
          Array.head(runs),
          { onNone: () => '?', onSome: (run) => run.skill },
        )}`,
        checks: [check(true, 'parses as JSON'), check(true, 'recognized as run results')],
        advisories: [],
        error: '',
      },
      maybeRuns: Option.some(runs),
    }),
  });

const display = (value: unknown): string => String(value);

const recognizeArtifact = (record: JsonRecord): Option.Option<{ kind: string; summary: string }> => {
  if (globalThis.Array.isArray(record.assertion_results) || record.summary) {
    const summary = Option.getOrElse(toRecord(record.summary), (): JsonRecord => ({}));
    const counts = isPresent(summary.passed)
      ? `${display(summary.passed)}/${display(summary.total ?? '?')} passed`
      : 'per-assertion results';
    return Option.some({
      kind: 'grading.json',
      summary: counts + (record.case_id ? ` · ${display(record.case_id)}` : ''),
    });
  }
  if (isPresent(record.delta) || (isPresent(record.with) && isPresent(record.without))) {
    return Option.some({
      kind: 'benchmark.json',
      summary: `with ${display(record.with ?? '?')} · without ${display(record.without ?? '?')} · Δ ${display(record.delta ?? '?')}`,
    });
  }
  if (isPresent(record.duration_ms) || isPresent(record.tokens) || isPresent(record.cost)) {
    const parts = Array.getSomes([
      isPresent(record.duration_ms) ? Option.some(`${display(record.duration_ms)}ms`) : Option.none(),
      isPresent(record.cost) ? Option.some(`$${display(record.cost)}`) : Option.none(),
    ]);
    return Option.some({ kind: 'timing.json', summary: parts.join(' · ') || 'duration & cost' });
  }
  if (globalThis.Array.isArray(record.notes) || isPresent(record.feedback)) {
    return Option.some({
      kind: 'feedback.json',
      summary: globalThis.Array.isArray(record.notes) ? `${record.notes.length} notes` : 'review notes',
    });
  }
  return Option.none();
};

type Parsed = Readonly<{ _tag: 'Parsed'; value: unknown }> | Readonly<{ _tag: 'Unparsable'; error: string }>;

const parseJson = (text: string): Parsed => {
  try {
    return { _tag: 'Parsed', value: JSON.parse(text) as unknown };
  } catch (error) {
    return {
      _tag: 'Unparsable',
      error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
};

export const inspectArtifact = (text: string, nowIso: string): InspectionOutcome => {
  const parsed = parseJson(text);
  const maybeRecord = parsed._tag === 'Parsed' ? toRecord(parsed.value) : Option.none();

  return Option.match(maybeRecord, {
    onNone: () =>
      inspected({
        ok: false,
        kind: '',
        summary: '',
        checks: [check(false, 'parses as JSON')],
        advisories: [],
        error: parsed._tag === 'Unparsable' ? parsed.error : 'not a JSON object',
      }),
    onSome: (record) => {
      if (globalThis.Array.isArray(record.runs) || globalThis.Array.isArray(record.cases)) {
        return inspectRunResults(record, nowIso);
      }
      if (globalThis.Array.isArray(record.evals)) {
        return inspected(inspectSuite(record));
      }
      return inspected(
        Option.match(recognizeArtifact(record), {
          onNone: (): Inspection => ({
            ok: false,
            kind: 'unrecognized',
            summary: '',
            checks: [check(true, 'parses as JSON'), check(false, 'a recognized arc-skill-eval artifact')],
            advisories: [],
            error: 'not a recognized arc-skill-eval JSON file',
          }),
          onSome: ({ kind, summary }): Inspection => ({
            ok: true,
            kind,
            summary,
            checks: [check(true, 'parses as JSON'), check(true, `recognized as ${kind}`)],
            advisories: [],
            error: '',
          }),
        }),
      );
    },
  });
};

export const sampleRunJson = (nowIso: string): string =>
  JSON.stringify(
    {
      id: 'sample-review-run',
      skill: 'sample-skill',
      workspaceRoot: './sample-skill',
      evalsJson: {
        evals: [
          { id: 'case-pass', prompt: 'Summarize the notes into a concise project update.' },
          { id: 'case-fail', prompt: 'Flag missing acceptance criteria before creating implementation work.' },
        ],
      },
      finishedAt: nowIso,
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
    },
    null,
    2,
  );

const fromDaemonCase = (value: unknown, index: number): Option.Option<ReviewCase> =>
  Result.getSuccess(normalizeCase(value, index));

const fromDaemonRun = (value: unknown): Option.Option<ReviewRun> =>
  Option.flatMap(
    Option.filter(toRecord(value), (record) => typeof record.id === 'string'),
    (record) =>
      Option.some({
        id: String(record.id),
        skill: asString(record.skill, 'unknown-skill'),
        workspaceRoot: typeof record.workspaceRoot === 'string' ? record.workspaceRoot : '',
        maybeEvalsJson: Option.filter(Option.some(record.evalsJson), isPresent),
        finishedAt: typeof record.finishedAt === 'string' ? record.finishedAt : '',
        maybeStatus: isPresent(record.status) ? Option.some(normalizeCaseStatus(record.status)) : Option.none(),
        maybeCost: maybeNumber(record.cost),
        maybeExitCode: maybeNumber(record.exitCode),
        cases: Array.getSomes(Array.map(asArray(record.cases), fromDaemonCase)),
      }),
  );

export const fromDaemonRuns = (payload: unknown): ReadonlyArray<ReviewRun> =>
  Option.match(toRecord(payload), {
    onNone: () => [],
    onSome: (record) => Array.getSomes(Array.map(asArray(record.runs), fromDaemonRun)),
  });
