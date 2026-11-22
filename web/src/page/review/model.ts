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
  /** The env and workspace root the localhost runs were fetched for (to spot changes in `contextChanged`). */
  env: EnvName,
  workspaceRoot: Schema.String,
  /** Runs imported through the import panel (kept in memory across section switches). */
  importedRuns: Schema.Array(ReviewRun),
  /** Runs the daemon read from disk (localhost only). */
  localRuns: Schema.Array(ReviewRun),
  /** Skills the daemon has reported runs for (localhost only). */
  localSkillIds: Schema.Array(Schema.String),
  feedback: Schema.Array(FeedbackNote),
  improvePlans: Schema.Array(ImprovePlanSummary),
  maybeLastRunId: Schema.Option(Schema.String),
  /** When runs last arrived; relative "finished … ago" labels are computed against it. */
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
