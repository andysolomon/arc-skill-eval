import { Schema } from 'effect';

import { Composer, FieldName } from './composer';
import { RunState } from './lifecycle';

// MODEL

export const Model = Schema.Struct({
  composer: Composer,
  /** The one expanded flag row, if any. */
  maybeOpenField: Schema.Option(FieldName),
  extraSkillDraft: Schema.String,
  run: RunState,
  /** Counts run starts, so a POST answered after a cancel is recognised. */
  runAttempt: Schema.Number,
  maybeLastRunId: Schema.Option(Schema.String),
  spinnerFrame: Schema.Number,
});
export type Model = typeof Model.Type;
