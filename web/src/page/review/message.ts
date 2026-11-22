import { Schema } from 'effect';
import { File } from 'foldkit';
import { defineMessageUnion } from 'foldkit/message';

import { ApplyResult, FeedbackNote, ImprovePlanSummary, ProposedPlan, ReviewRun, StagedPlan } from './domain';

export const Message = defineMessageUnion({
  CompletedLoadReviewData: {
    importedRuns: Schema.Array(ReviewRun),
    feedback: Schema.Array(FeedbackNote),
    improvePlans: Schema.Array(ImprovePlanSummary),
    maybeLastRunId: Schema.Option(Schema.String),
    nowMillis: Schema.Number,
  },
  SucceededFetchRuns: {
    runs: Schema.Array(ReviewRun),
    maybeSkillId: Schema.Option(Schema.String),
    nowMillis: Schema.Number,
  },
  FailedFetchRuns: {},
  SelectedSkill: { skillId: Schema.String },
  SelectedRun: { runId: Schema.String },
  SelectedCase: { caseId: Schema.String },
  UpdatedPasteText: { value: Schema.String },
  ClickedInspectJson: {},
  CompletedGetInspectionTime: { nowMillis: Schema.Number },
  ClickedLoadSample: {},
  CompletedCreateSampleArtifact: { text: Schema.String, nowMillis: Schema.Number },
  SelectedImportFiles: { files: Schema.Array(File.File) },
  DroppedImportFiles: { files: Schema.Array(File.File) },
  SucceededReadImportFile: { text: Schema.String, nowMillis: Schema.Number },
  FailedReadImportFile: {},
  CompletedStoreImportedRuns: {},
  CompletedSaveLastRunId: {},
  UpdatedNote: { value: Schema.String },
  ClickedRecordFeedback: {},
  SucceededAddFeedback: { feedback: Schema.Array(FeedbackNote) },
  FailedAddFeedback: {},
  ClickedRemoveFeedback: { noteId: Schema.String },
  CompletedConfirmRemoveFeedback: { noteId: Schema.String, confirmed: Schema.Boolean },
  SucceededDeleteFeedback: { feedback: Schema.Array(FeedbackNote) },
  FailedDeleteFeedback: {},
  ClickedProposePlan: {},
  SucceededDerivePlan: { plan: ProposedPlan },
  FailedDerivePlan: { error: Schema.String },
  SucceededDownloadPlan: {},
  FailedDownloadPlan: {},
  SucceededStagePlan: { staged: StagedPlan },
  FailedStagePlan: { error: Schema.String },
  ClickedApplyChanges: {},
  SucceededCommitPlan: { result: ApplyResult },
  FailedCommitPlan: { error: Schema.String },
  ClickedDiscardPlan: {},
  SucceededCancelPlan: { result: ApplyResult },
  FailedCancelPlan: { error: Schema.String },
});
export type Message = typeof Message.Type;
