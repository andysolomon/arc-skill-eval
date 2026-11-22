import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';

import { CompareMode, ContextMode, FieldName, SandboxMode } from './composer';
import { RunEvent } from './runEvent';

// MESSAGE

export const Message = defineMessageUnion({
  ClickedReviewLink: {},
  ClickedLearnLink: {},
  ClickedFlagRow: { field: FieldName },
  SelectedSkill: { workspaceRoot: Schema.String },
  SelectedCase: { value: Schema.String },
  SelectedModel: { value: Schema.String },
  SelectedJudgeModel: { value: Schema.String },
  SelectedCompare: { value: CompareMode },
  SelectedIteration: { value: Schema.Number },
  SelectedContextMode: { value: ContextMode },
  SelectedSandbox: { value: SandboxMode },
  UpdatedExtraSkillDraft: { value: Schema.String },
  PressedExtraSkillEnter: {},
  ClickedAddExtraSkill: {},
  ClickedRemoveExtraSkill: { extraSkill: Schema.String },
  ClickedRunButton: {},
  ClickedInspectInBrowse: {},
  TickedSpinner: {},
  SucceededStartRun: {
    attempt: Schema.Number,
    runId: Schema.String,
    socketUrl: Schema.String,
    startedAtMs: Schema.Number,
  },
  FailedStartRun: { attempt: Schema.Number, error: Schema.String },
  ReceivedRunEvent: { event: RunEvent, receivedAtMs: Schema.Number },
  CompletedDeleteRun: {},
  CompletedLoadLastRunId: { maybeLastRunId: Schema.Option(Schema.String) },
  CompletedSaveLastRunId: { runId: Schema.String },
  CompletedShowAlert: {},
});
export type Message = typeof Message.Type;
