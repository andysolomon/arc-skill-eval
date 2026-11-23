import { Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import { Composer, FieldName } from './composer';
import { RunState } from './lifecycle';

// SUITE

/** The case ids in the selected skill's evals.json, read from the daemon for the Cases row. */
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
  /** The one expanded flag row, if any. */
  maybeOpenField: Schema.Option(FieldName),
  extraSkillDraft: Schema.String,
  suiteCases: SuiteCases,
  run: RunState,
  /** Counts run starts, so a POST answered after a cancel is recognised. */
  runAttempt: Schema.Number,
  maybeLastRunId: Schema.Option(Schema.String),
  spinnerFrame: Schema.Number,
});
export type Model = typeof Model.Type;
