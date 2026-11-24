import { Option, Schema } from 'effect';
import { defineTaggedUnion } from 'foldkit/schema';

import { ChapterId } from './chapterList';

// MODEL

export const Playback = defineTaggedUnion({
  Playing: {},
  Paused: {},
});
export type Playback = typeof Playback.Type;

export const CreateDemo = Schema.Struct({
  commandTick: Schema.Number,
  scaffoldTick: Schema.Number,
  playback: Playback,
});
export type CreateDemo = typeof CreateDemo.Type;

export const PiDemo = Schema.Struct({
  tick: Schema.Number,
  playback: Playback,
});
export type PiDemo = typeof PiDemo.Type;

export const Reader = defineTaggedUnion({
  Restoring: {},
  Reading: { chapterId: ChapterId },
});
export type Reader = typeof Reader.Type;

export const Model = Schema.Struct({
  reader: Reader,
  scrollPos: Schema.Number,
  completedSteps: Schema.Array(Schema.String),
  createDemo: CreateDemo,
  piDemo: PiDemo,
});
export type Model = typeof Model.Type;

export const initialCreateDemo: CreateDemo = { commandTick: 0, scaffoldTick: 0, playback: Playback.Playing() };
export const initialPiDemo: PiDemo = { tick: 0, playback: Playback.Playing() };

export const maybeOpenChapterId = (model: Model): Option.Option<ChapterId> =>
  Reader.match(model.reader, {
    Restoring: () => Option.none(),
    Reading: ({ chapterId }) => Option.some(chapterId),
  });
