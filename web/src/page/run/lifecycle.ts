/**
 * Run lifecycle: a run is idle, starting (POST in flight), streaming
 * progress over the daemon socket, done with a benchmark, or failed with the
 * daemon's reason. Pure transitions; update.ts sequences them with the
 * Commands and socket Messages that drive them.
 */

import { Array, Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';
import { modifyFields } from 'foldkit/struct';

import { ALL_CASES, type Composer } from './composer';
import { ProgressRow, RunEvent, type RunSummary } from './runEvent';

// MODEL

export const Benchmark = Schema.Struct({
  passed: Schema.Number,
  total: Schema.Number,
  cost: Schema.Number,
  maybeDelta: Schema.Option(Schema.Number),
  exitCode: Schema.Number,
  artifactPath: Schema.String,
  maybeWithSkill: Schema.Option(Schema.Number),
  maybeWithoutSkill: Schema.Option(Schema.Number),
});
export type Benchmark = typeof Benchmark.Type;

export const RunState = defineTaggedUnion({
  Idle: {},
  /** `attempt` tells this POST's answer apart from one the user cancelled. */
  Starting: { attempt: Schema.Number, progressRows: Schema.Array(ProgressRow) },
  Streaming: {
    runId: Schema.String,
    socketUrl: Schema.String,
    startedAtMs: Schema.Number,
    elapsedSec: Schema.Number,
    progressRows: Schema.Array(ProgressRow),
  },
  Done: {
    runId: Schema.String,
    elapsedSec: Schema.Number,
    progressRows: Schema.Array(ProgressRow),
    benchmark: Benchmark,
  },
  Failed: {
    runId: Schema.String,
    elapsedSec: Schema.Number,
    progressRows: Schema.Array(ProgressRow),
    error: Schema.String,
  },
});
export type RunState = typeof RunState.Type;
export type Streaming = typeof RunState.Streaming.Type;

export const isRunning = (run: RunState): boolean => run._tag === 'Starting' || run._tag === 'Streaming';

export const progressRows = (run: RunState): ReadonlyArray<ProgressRow> =>
  RunState.match(run, {
    Idle: () => [],
    Starting: ({ progressRows: rows }) => rows,
    Streaming: ({ progressRows: rows }) => rows,
    Done: ({ progressRows: rows }) => rows,
    Failed: ({ progressRows: rows }) => rows,
  });

export const maybeRunId = (run: RunState): Option.Option<string> =>
  RunState.match(run, {
    Idle: () => Option.none(),
    Starting: () => Option.none(),
    Streaming: ({ runId }) => Option.some(runId),
    Done: ({ runId }) => Option.some(runId),
    Failed: ({ runId }) => Option.some(runId),
  });

export const elapsedSec = (run: RunState): number =>
  RunState.match(run, {
    Idle: () => 0,
    Starting: () => 0,
    Streaming: ({ elapsedSec: seconds }) => seconds,
    Done: ({ elapsedSec: seconds }) => seconds,
    Failed: ({ elapsedSec: seconds }) => seconds,
  });

// TRANSITIONS

/** Label of the placeholder row for a whole-suite run; the daemon's first case rows replace it. */
const ALL_CASES_ROW = 'all cases';

/** The placeholder row shown while the daemon accepts the run. */
export const acceptedRow = (composer: Composer): ProgressRow => ({
  caseId: composer.case === ALL_CASES ? ALL_CASES_ROW : composer.case,
  phase: 'queued',
  assertionsPassed: 0,
  assertionsFailed: 0,
  totalAssertions: 0,
  maybeError: Option.none(),
});

export const start = (attempt: number, composer: Composer): RunState =>
  RunState.Starting({ attempt, progressRows: [acceptedRow(composer)] });

export const accept = (
  starting: typeof RunState.Starting.Type,
  accepted: Readonly<{ runId: string; socketUrl: string; startedAtMs: number }>,
): RunState =>
  RunState.Streaming({
    runId: accepted.runId,
    socketUrl: accepted.socketUrl,
    startedAtMs: accepted.startedAtMs,
    elapsedSec: 0,
    progressRows: starting.progressRows,
  });

/** A later frame for a case updates its row instead of adding one; the placeholder row goes away. */
export const mergeProgressRow = (rows: ReadonlyArray<ProgressRow>, row: ProgressRow): ReadonlyArray<ProgressRow> => {
  const caseRows = Array.filter(rows, (candidate) => candidate.caseId !== ALL_CASES_ROW);
  return Array.some(caseRows, (candidate) => candidate.caseId === row.caseId)
    ? Array.map(caseRows, (candidate) => (candidate.caseId === row.caseId ? row : candidate))
    : Array.append(caseRows, row);
};

const secondsSince = (startedAtMs: number, nowMs: number): number =>
  Math.max(0, Math.round((nowMs - startedAtMs) / 1000));

export const toBenchmark = (summary: RunSummary, runId: string, rows: ReadonlyArray<ProgressRow>): Benchmark => ({
  passed: Option.getOrElse(summary.maybePassed, () => Array.filter(rows, (row) => row.phase === 'pass').length),
  total: Option.getOrElse(summary.maybeTotal, () => rows.length),
  cost: Option.getOrElse(summary.maybeCost, () => 0),
  maybeDelta: summary.maybeDelta,
  exitCode: Option.getOrElse(summary.maybeExitCode, () => 0),
  artifactPath: Option.getOrElse(summary.maybeArtifactPath, () => `evals-runs/${runId}`),
  maybeWithSkill: summary.maybeWithSkill,
  maybeWithoutSkill: summary.maybeWithoutSkill,
});

export type EventOutcome = Readonly<{
  run: RunState;
  /** Set when this event finished the run: remember it as the last run. */
  maybeFinishedRunId: Option.Option<string>;
}>;

const continued = (run: RunState): EventOutcome => ({ run, maybeFinishedRunId: Option.none() });

const finish = (
  runId: string,
  rows: ReadonlyArray<ProgressRow>,
  summary: RunSummary,
  seconds: number,
): EventOutcome => ({
  run: RunState.Done({ runId, elapsedSec: seconds, progressRows: rows, benchmark: toBenchmark(summary, runId, rows) }),
  maybeFinishedRunId: Option.some(runId),
});

/** Apply one socket frame received at `nowMs` to a streaming run. */
export const applyEvent = (streaming: Streaming, event: RunEvent, nowMs: number): EventOutcome => {
  const seconds = secondsSince(streaming.startedAtMs, nowMs);
  return RunEvent.match(event, {
    Snapshot: ({ maybeRunId: maybeSnapshotRunId, maybeStatus, progress, summary }) => {
      const runId = Option.getOrElse(maybeSnapshotRunId, () => streaming.runId);
      const rows = Array.reduce(progress, streaming.progressRows, mergeProgressRow);
      return Option.contains(maybeStatus, 'completed') && Option.isSome(maybeSnapshotRunId)
        ? finish(runId, rows, summary, seconds)
        : continued(
            modifyFields(streaming, {
              runId: () => runId,
              progressRows: () => rows,
              elapsedSec: () => (Array.isReadonlyArrayEmpty(progress) ? streaming.elapsedSec : seconds),
            }),
          );
    },
    Completed: ({ maybeRunId: maybeCompletedRunId, summary }) =>
      finish(
        Option.getOrElse(maybeCompletedRunId, () => streaming.runId),
        streaming.progressRows,
        summary,
        seconds,
      ),
    Cancelled: () => continued(RunState.Idle()),
    Failed: ({ message }) =>
      continued(
        RunState.Failed({
          runId: streaming.runId,
          elapsedSec: seconds,
          progressRows: streaming.progressRows,
          error: message,
        }),
      ),
    Progress: ({ row }) =>
      continued(
        modifyFields(streaming, {
          progressRows: (rows) => mergeProgressRow(rows, row),
          elapsedSec: () => seconds,
        }),
      ),
  });
};
