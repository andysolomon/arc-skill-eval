import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

export const ReviewCaseStatus = Schema.Literals(['pass', 'fail', 'partial', 'timeout']);
export type ReviewCaseStatus = typeof ReviewCaseStatus.Type;

export const ReviewCase = Schema.Struct({
  id: Schema.String,
  prompt: Schema.String,
  status: ReviewCaseStatus,
  maybeOutput: Schema.Option(Schema.String),
  maybeFailureEvidence: Schema.Option(Schema.String),
  maybeWithPassed: Schema.Option(Schema.Number),
  maybeWithTotal: Schema.Option(Schema.Number),
  maybeWithoutPassed: Schema.Option(Schema.Number),
  maybeWithoutTotal: Schema.Option(Schema.Number),
  maybeDelta: Schema.Option(Schema.String),
});
export type ReviewCase = typeof ReviewCase.Type;

export const ReviewRun = Schema.Struct({
  id: Schema.String,
  skill: Schema.String,
  workspaceRoot: Schema.String,
  maybeEvalsJson: Schema.Option(Schema.Unknown),
  finishedAt: Schema.String,
  maybeStatus: Schema.Option(ReviewCaseStatus),
  maybeCost: Schema.Option(Schema.Number),
  maybeExitCode: Schema.Option(Schema.Number),
  cases: Schema.Array(ReviewCase),
});
export type ReviewRun = typeof ReviewRun.Type;

export const ImportCheck = Schema.Struct({ ok: Schema.Boolean, label: Schema.String });
export type ImportCheck = typeof ImportCheck.Type;

export const Inspection = Schema.Struct({
  ok: Schema.Boolean,
  kind: Schema.String,
  summary: Schema.String,
  checks: Schema.Array(ImportCheck),
  advisories: Schema.Array(ImportCheck),
  error: Schema.String,
});
export type Inspection = typeof Inspection.Type;

export const FeedbackNote = Schema.Struct({
  noteId: Schema.String,
  runId: Schema.String,
  maybeCaseId: Schema.Option(Schema.String),
  note: Schema.String,
  createdAt: Schema.String,
});
export type FeedbackNote = typeof FeedbackNote.Type;

export const ImprovePlanSummary = Schema.Struct({
  planId: Schema.String,
  runId: Schema.String,
  status: Schema.String,
  createdAt: Schema.String,
});
export type ImprovePlanSummary = typeof ImprovePlanSummary.Type;

export const ImprovePlanItem = Schema.Struct({
  path: Schema.String,
  before: Schema.String,
  after: Schema.String,
  rationale: Schema.String,
});
export type ImprovePlanItem = typeof ImprovePlanItem.Type;

export const ProposedPlan = Schema.Struct({
  planId: Schema.String,
  runId: Schema.String,
  workspaceRoot: Schema.String,
  maybeEvalsJson: Schema.Option(Schema.Unknown),
  sourceNoteIds: Schema.Array(Schema.String),
  items: Schema.Array(ImprovePlanItem),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type ProposedPlan = typeof ProposedPlan.Type;

export const StagedPlan = Schema.Struct({
  planId: Schema.String,
  stagingPath: Schema.String,
  diff: Schema.Unknown,
});
export type StagedPlan = typeof StagedPlan.Type;

export const ApplyResult = Schema.Struct({
  planId: Schema.String,
  maybePath: Schema.Option(Schema.String),
});
export type ApplyResult = typeof ApplyResult.Type;

export const Proposal = defineTaggedUnion({
  Idle: {},
  Deriving: {},
  Derived: { plan: ProposedPlan },
  Staging: { plan: ProposedPlan },
  Staged: { plan: ProposedPlan },
  Failed: { error: Schema.String },
});
export type Proposal = typeof Proposal.Type;

export const Apply = defineTaggedUnion({
  Idle: {},
  Committing: {},
  Committed: { result: ApplyResult },
  Cancelling: {},
  Cancelled: { result: ApplyResult },
  Failed: { error: Schema.String },
});
export type Apply = typeof Apply.Type;

export const PlanDownload = defineTaggedUnion({
  NotStarted: {},
  Started: {},
});
export type PlanDownload = typeof PlanDownload.Type;

export const Improve = Schema.Struct({
  proposal: Proposal,
  apply: Apply,
  maybeStagedPlan: Schema.Option(StagedPlan),
  download: PlanDownload,
});
export type Improve = typeof Improve.Type;

export const isImproveInFlight = (improve: Improve): boolean =>
  improve.proposal._tag === 'Deriving' ||
  improve.proposal._tag === 'Staging' ||
  improve.apply._tag === 'Committing' ||
  improve.apply._tag === 'Cancelling';
