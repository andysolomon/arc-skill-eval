import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';

import { ArtifactRequest } from './artifact';
import { Run, Tab, Variant } from './domain';
import { RunsQuery } from './model';

// MESSAGE

export const CaseStep = Schema.Literals(['next', 'previous']);
export type CaseStep = typeof CaseStep.Type;

export const Message = defineMessageUnion({
  SelectedSkill: { skillId: Schema.String },
  SelectedRun: { runId: Schema.String },
  SelectedCase: { caseId: Schema.String },
  PressedCaseStepKey: { step: CaseStep },
  SelectedTab: { tab: Tab },
  SelectedVariant: { variant: Variant },
  ClickedImportInReview: {},
  CompletedLoadImportedRuns: { runs: Schema.Array(Run) },
  SucceededFetchLocalRuns: { query: RunsQuery, runs: Schema.Array(Run) },
  FailedFetchLocalRuns: { query: RunsQuery },
  SucceededFetchArtifact: { request: ArtifactRequest, text: Schema.String },
  FailedFetchArtifact: { request: ArtifactRequest, error: Schema.String },
});
export type Message = typeof Message.Type;
