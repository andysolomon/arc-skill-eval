/**
 * The daemon's run progress protocol (WebSocket `/runs/<id>` frames), parsed
 * into {@link RunEvent}. The daemon has spoken a few dialects over time
 * (`caseId` / `case` / `id`, `passed` / `assertionsPassed`, ...); every alias
 * the React app accepted is accepted here, with the same precedence.
 */

import { Array, Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

// PROGRESS ROW

export const ProgressRow = Schema.Struct({
  caseId: Schema.String,
  assertionsPassed: Schema.Number,
  assertionsFailed: Schema.Number,
  totalAssertions: Schema.Number,
});
export type ProgressRow = typeof ProgressRow.Type;

// EVENT

/** Benchmark figures a completion frame may carry; turned into a Benchmark once the run id and rows are known. */
export const RunSummary = Schema.Struct({
  maybePassed: Schema.Option(Schema.Number),
  maybeTotal: Schema.Option(Schema.Number),
  maybeCost: Schema.Option(Schema.Number),
  maybeDelta: Schema.Option(Schema.Number),
  maybeExitCode: Schema.Option(Schema.Number),
  maybeArtifactPath: Schema.Option(Schema.String),
  maybeWithSkill: Schema.Option(Schema.Number),
  maybeWithoutSkill: Schema.Option(Schema.Number),
});
export type RunSummary = typeof RunSummary.Type;

export const RunEvent = defineTaggedUnion({
  /** Sent when a socket opens: the run so far, possibly already finished. */
  Snapshot: {
    maybeRunId: Schema.Option(Schema.String),
    maybeStatus: Schema.Option(Schema.String),
    progress: Schema.Array(ProgressRow),
    summary: RunSummary,
  },
  Completed: { maybeRunId: Schema.Option(Schema.String), summary: RunSummary },
  Cancelled: {},
  Progress: { row: ProgressRow },
});
export type RunEvent = typeof RunEvent.Type;

// PARSE

type Frame = Readonly<Record<string, unknown>>;

const FrameSchema = Schema.Record(Schema.String, Schema.Unknown);
const decodeFrame = Schema.decodeUnknownOption(FrameSchema);

/** The first value that is neither null nor undefined (JavaScript's `??` chain). */
const coalesce = (...values: ReadonlyArray<unknown>): unknown =>
  Option.getOrUndefined(Array.findFirst(values, (value) => value !== null && value !== undefined));

const maybeFiniteNumber = (value: unknown): Option.Option<number> =>
  typeof value === 'number' && Number.isFinite(value) ? Option.some(value) : Option.none();

const maybeNumber = (value: unknown): Option.Option<number> =>
  typeof value === 'number' ? Option.some(value) : Option.none();

const maybeString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' ? Option.some(value) : Option.none();

const numberOr = (value: unknown, fallback: number): number =>
  Option.getOrElse(maybeFiniteNumber(value), () => fallback);

export const toProgressRow = (frame: Frame): ProgressRow => {
  const assertionsPassed = numberOr(coalesce(frame.assertionsPassed, frame.passed), 0);
  const assertionsFailed = numberOr(coalesce(frame.assertionsFailed, frame.failed), 0);
  return {
    caseId: String(coalesce(frame.caseId, frame.case, frame.id, 'run')),
    assertionsPassed,
    assertionsFailed,
    totalAssertions: numberOr(
      coalesce(frame.totalAssertions, frame.assertionsTotal, frame.total),
      assertionsPassed + assertionsFailed,
    ),
  };
};

const toSummary = (frame: Frame): RunSummary => ({
  maybePassed: maybeFiniteNumber(frame.passed),
  maybeTotal: maybeFiniteNumber(frame.total),
  maybeCost: maybeFiniteNumber(coalesce(frame.cost, frame.costUsd)),
  maybeDelta: maybeNumber(frame.delta),
  maybeExitCode: maybeFiniteNumber(frame.exitCode),
  maybeArtifactPath: maybeString(frame.artifactPath),
  maybeWithSkill: maybeNumber(frame.withSkill),
  maybeWithoutSkill: maybeNumber(frame.withoutSkill),
});

const toSnapshot = (frame: Frame): RunEvent => {
  const run = Option.getOrElse(decodeFrame(frame.run), (): Frame => ({}));
  const progress = Array.isArray(run.progress) ? run.progress : [];
  return RunEvent.Snapshot({
    maybeRunId: Option.filter(maybeString(run.runId), (runId) => runId !== ''),
    maybeStatus: maybeString(run.status),
    progress: Array.getSomes(Array.map(progress, (entry) => Option.map(decodeFrame(entry), toProgressRow))),
    summary: toSummary(frame),
  });
};

const toRunEvent = (frame: Frame): RunEvent => {
  if (frame.type === 'run.snapshot') {
    return toSnapshot(frame);
  }
  if (frame.type === 'run.completed') {
    return RunEvent.Completed({ maybeRunId: maybeString(frame.runId), summary: toSummary(frame) });
  }
  if (frame.type === 'run.cancelled') {
    return RunEvent.Cancelled();
  }
  return RunEvent.Progress({ row: toProgressRow(frame) });
};

const parseJson = (data: string): Option.Option<unknown> => {
  try {
    return Option.some(JSON.parse(data) as unknown);
  } catch {
    return Option.none();
  }
};

/** Parse one text frame; frames that are not a JSON object are ignored. */
export const parseRunEvent = (data: string): Option.Option<RunEvent> =>
  parseJson(data).pipe(Option.flatMap(decodeFrame), Option.map(toRunEvent));
