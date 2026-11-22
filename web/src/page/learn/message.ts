import { Schema } from 'effect';
import { defineMessageUnion } from 'foldkit/message';

import { ChapterId } from './chapterList';

// MESSAGE

export const SavedProgress = Schema.Struct({
  chapterId: ChapterId,
  scrollPos: Schema.Number,
  completedSteps: Schema.Array(Schema.String),
});
export type SavedProgress = typeof SavedProgress.Type;

export const Message = defineMessageUnion({
  ClickedChapter: { chapterId: ChapterId },
  ClickedDeepDive: { chapterId: ChapterId },
  PressedDeepDiveActivationKey: { chapterId: ChapterId },
  ClickedCreateDemoPlayback: {},
  ClickedCreateDemoReplay: {},
  ClickedPiDemoPlayback: {},
  ClickedPiDemoReplay: {},
  TickedCreateCommandDemo: {},
  TickedCreateScaffoldDemo: {},
  TickedPiDemo: {},
  SucceededLoadReaderProgress: { maybeProgress: Schema.Option(SavedProgress) },
  FailedLoadReaderProgress: {},
  CompletedSaveReaderProgress: {},
  CompletedScrollReaderToTop: {},
});
export type Message = typeof Message.Type;
