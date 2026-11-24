import { Clock, Effect, Option } from 'effect';
import { Command } from 'foldkit';

import { getLearnReaderProgress, putLearnReaderProgress } from '@/persistence/learnReader';

import { decodeChapterId } from './chapterList';
import { Message, SavedProgress } from './message';

// COMMAND

export const READER_SCROLL_ID = 'learn-scroll';

export const LoadReaderProgress = Command.define('LoadReaderProgress', {
  messages: [Message.SucceededLoadReaderProgress, Message.FailedLoadReaderProgress],
  execute: Effect.tryPromise(() => getLearnReaderProgress()).pipe(
    Effect.map((maybeRecord) =>
      Message.SucceededLoadReaderProgress({
        maybeProgress: Option.map(Option.fromUndefinedOr(maybeRecord), (record) => ({
          chapterId: Option.getOrElse(decodeChapterId(record.currentChapterId), () => 'overview' as const),
          scrollPos: record.scrollPos,
          completedSteps: record.completedSteps,
        })),
      }),
    ),
    Effect.catch(() => Effect.succeed(Message.FailedLoadReaderProgress())),
  ),
});

export const SaveReaderProgress = Command.define('SaveReaderProgress', {
  args: { progress: SavedProgress },
  messages: [Message.CompletedSaveReaderProgress],
  execute: ({ progress }) =>
    Clock.currentTimeMillis.pipe(
      Effect.flatMap((now) =>
        Effect.tryPromise(() =>
          putLearnReaderProgress(
            {
              currentChapterId: progress.chapterId,
              scrollPos: progress.scrollPos,
              completedSteps: [...progress.completedSteps],
            },
            new Date(now).toISOString(),
          ),
        ),
      ),
      Effect.ignore,
      Effect.as(Message.CompletedSaveReaderProgress()),
    ),
});

export const ScrollReaderToTop = Command.define('ScrollReaderToTop', {
  messages: [Message.CompletedScrollReaderToTop],
  execute: Effect.sync(() => {
    document.getElementById(READER_SCROLL_ID)?.scrollTo({ top: 0 });
    return Message.CompletedScrollReaderToTop();
  }),
});
