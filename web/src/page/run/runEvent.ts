import { Array, Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

export const CasePhase = Schema.Literals(['queued', 'running', 'pass', 'fail']);
export type CasePhase = typeof CasePhase.Type;

export const ProgressRow = Schema.Struct({
  caseId: Schema.String,
  phase: CasePhase,
  assertionsPassed: Schema.Number,
  assertionsFailed: Schema.Number,
  totalAssertions: Schema.Number,
  maybeError: Schema.Option(Schema.String),
});
export type ProgressRow = typeof ProgressRow.Type;

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
  Snapshot: {
    maybeRunId: Schema.Option(Schema.String),
    maybeStatus: Schema.Option(Schema.String),
    progress: Schema.Array(ProgressRow),
    summary: RunSummary,
  },
  Completed: { maybeRunId: Schema.Option(Schema.String), summary: RunSummary },
  Cancelled: {},
  Failed: { message: Schema.String },
  Progress: { row: ProgressRow },
});
export type RunEvent = typeof RunEvent.Type;

type Frame = Readonly<Record<string, unknown>>;

const FrameSchema = Schema.Record(Schema.String, Schema.Unknown);
const decodeFrame = Schema.decodeUnknownOption(FrameSchema);
const decodePhase = Schema.decodeUnknownOption(CasePhase);

const maybeFiniteNumber = (value: unknown): Option.Option<number> =>
  typeof value === 'number' && Number.isFinite(value) ? Option.some(value) : Option.none();

const maybeString = (value: unknown): Option.Option<string> =>
  typeof value === 'string' ? Option.some(value) : Option.none();

const numberOr = (value: unknown, fallback: number): number =>
  Option.getOrElse(maybeFiniteNumber(value), () => fallback);

const derivedPhase = (passed: number, failed: number, total: number): CasePhase =>
  failed > 0 ? 'fail' : total > 0 && passed >= total ? 'pass' : 'running';

export const toProgressRow = (frame: Frame): ProgressRow => {
  const assertionsPassed = numberOr(frame.assertionsPassed, 0);
  const assertionsFailed = numberOr(frame.assertionsFailed, 0);
  const totalAssertions = numberOr(frame.totalAssertions, assertionsPassed + assertionsFailed);
  return {
    caseId: String(frame.caseId ?? 'run'),
    phase: Option.getOrElse(decodePhase(frame.phase), () =>
      derivedPhase(assertionsPassed, assertionsFailed, totalAssertions),
    ),
    assertionsPassed,
    assertionsFailed,
    totalAssertions,
    maybeError: Option.filter(maybeString(frame.error), (error) => error !== ''),
  };
};

const toSummary = (frame: Frame): RunSummary => ({
  maybePassed: maybeFiniteNumber(frame.passed),
  maybeTotal: maybeFiniteNumber(frame.total),
  maybeCost: maybeFiniteNumber(frame.cost),
  maybeDelta: maybeFiniteNumber(frame.delta),
  maybeExitCode: maybeFiniteNumber(frame.exitCode),
  maybeArtifactPath: maybeString(frame.artifactPath),
  maybeWithSkill: maybeFiniteNumber(frame.withSkill),
  maybeWithoutSkill: maybeFiniteNumber(frame.withoutSkill),
});

const toSnapshot = (frame: Frame): RunEvent => {
  const run = Option.getOrElse(decodeFrame(frame.run), (): Frame => ({}));
  const progress = globalThis.Array.isArray(run.progress) ? run.progress : [];
  return RunEvent.Snapshot({
    maybeRunId: Option.filter(maybeString(run.runId), (runId) => runId !== ''),
    maybeStatus: maybeString(run.status),
    progress: Array.getSomes(Array.map(progress, (entry) => Option.map(decodeFrame(entry), toProgressRow))),
    summary: toSummary(frame),
  });
};

const toRunEvent = (frame: Frame): Option.Option<RunEvent> => {
  switch (frame.type) {
    case 'run.snapshot':
      return Option.some(toSnapshot(frame));
    case 'case.progress':
      return Option.some(RunEvent.Progress({ row: toProgressRow(frame) }));
    case 'run.completed':
      return Option.some(RunEvent.Completed({ maybeRunId: maybeString(frame.runId), summary: toSummary(frame) }));
    case 'run.cancelled':
      return Option.some(RunEvent.Cancelled());
    case 'run.failed':
      return Option.some(
        RunEvent.Failed({ message: Option.getOrElse(maybeString(frame.message), () => 'The run failed.') }),
      );
    default:
      return Option.none();
  }
};

const parseJson = (data: string): Option.Option<unknown> => {
  try {
    return Option.some(JSON.parse(data) as unknown);
  } catch {
    return Option.none();
  }
};

export const parseRunEvent = (data: string): Option.Option<RunEvent> =>
  parseJson(data).pipe(Option.flatMap(decodeFrame), Option.flatMap(toRunEvent));
