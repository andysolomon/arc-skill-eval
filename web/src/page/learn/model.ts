import { Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import { ChapterId } from './chapterList';

// MODEL

/** Whether an animated demo is advancing. Both start Playing when their chapter opens. */
export const Playback = defineTaggedUnion({
  Playing: {},
  Paused: {},
});
export type Playback = typeof Playback.Type;

/**
 * The two terminal demos in "Creating an eval": the `create` command run and
 * the scaffolded file tree. They loop independently but share one pause state.
 */
export const CreateDemo = Schema.Struct({
  commandTick: Schema.Number,
  scaffoldTick: Schema.Number,
  playback: Playback,
});
export type CreateDemo = typeof CreateDemo.Type;

/** The agent-loop demo in "The Pi runtime". */
export const PiDemo = Schema.Struct({
  tick: Schema.Number,
  playback: Playback,
});
export type PiDemo = typeof PiDemo.Type;

/** Restoring until the saved chapter has been read from IndexedDB. */
export const Reader = defineTaggedUnion({
  Restoring: {},
  Reading: { chapterId: ChapterId },
});
export type Reader = typeof Reader.Type;

export const Model = Schema.Struct({
  reader: Reader,
  /** Carried through from the saved record so a save never drops it. */
  scrollPos: Schema.Number,
  /** Carried through from the saved record so a save never drops it. */
  completedSteps: Schema.Array(Schema.String),
  createDemo: CreateDemo,
  piDemo: PiDemo,
});
export type Model = typeof Model.Type;

export const initialCreateDemo: CreateDemo = { commandTick: 0, scaffoldTick: 0, playback: Playback.Playing() };
export const initialPiDemo: PiDemo = { tick: 0, playback: Playback.Playing() };

/** The chapter on screen; none while the saved position is being restored. */
export const maybeOpenChapterId = (model: Model): Option.Option<ChapterId> =>
  Reader.match(model.reader, {
    Restoring: () => Option.none(),
    Reading: ({ chapterId }) => Option.some(chapterId),
  });
