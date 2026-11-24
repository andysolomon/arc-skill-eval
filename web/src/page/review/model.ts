import { Option, Schema } from 'effect';

import { EnvName } from '@/app/domain';

import {
  Apply,
  FeedbackNote,
  Improve,
  ImprovePlanSummary,
  Inspection,
  PlanDownload,
  Proposal,
  ReviewRun,
} from './domain';

export const Model = Schema.Struct({
  env: EnvName,
  workspaceRoot: Schema.String,
  importedRuns: Schema.Array(ReviewRun),
  localRuns: Schema.Array(ReviewRun),
  localSkillIds: Schema.Array(Schema.String),
  feedback: Schema.Array(FeedbackNote),
  improvePlans: Schema.Array(ImprovePlanSummary),
  maybeLastRunId: Schema.Option(Schema.String),
  maybeNowMillis: Schema.Option(Schema.Number),
  maybeSelectedSkillId: Schema.Option(Schema.String),
  maybeSelectedRunId: Schema.Option(Schema.String),
  maybeSelectedCaseId: Schema.Option(Schema.String),
  pasteText: Schema.String,
  maybeInspection: Schema.Option(Inspection),
  note: Schema.String,
  improve: Improve,
});
export type Model = typeof Model.Type;

export const initialImprove: Improve = {
  proposal: Proposal.Idle(),
  apply: Apply.Idle(),
  maybeStagedPlan: Option.none(),
  download: PlanDownload.NotStarted(),
};
