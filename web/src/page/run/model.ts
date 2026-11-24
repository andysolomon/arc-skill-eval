import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import { Composer, FieldName } from './composer';
import { RunState } from './lifecycle';

export const SuiteCases = defineTaggedUnion({
  NotLoaded: {},
  Loading: { workspaceRoot: Schema.String },
  Loaded: { workspaceRoot: Schema.String, caseIds: Schema.Array(Schema.String) },
  Failed: { workspaceRoot: Schema.String, error: Schema.String },
});
export type SuiteCases = typeof SuiteCases.Type;

// MODEL

export const Model = Schema.Struct({
  composer: Composer,
  maybeOpenField: Schema.Option(FieldName),
  extraSkillDraft: Schema.String,
  suiteCases: SuiteCases,
  run: RunState,
  runAttempt: Schema.Number,
  maybeLastRunId: Schema.Option(Schema.String),
  spinnerFrame: Schema.Number,
});
export type Model = typeof Model.Type;
