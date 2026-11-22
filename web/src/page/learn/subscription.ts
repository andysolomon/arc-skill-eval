import { Duration, Effect, Option, Schema, Stream } from 'effect';
import { Subscription } from 'foldkit';

import { CREATE_COMMAND_TICK_MS, CREATE_SCAFFOLD_TICK_MS, PI_TICK_MS } from './animation';
import type { ChapterId } from './chapterList';
import { Message } from './message';
import { maybeOpenChapterId, type Model, type Playback } from './model';

// SUBSCRIPTION

/** A demo animates only while its chapter is open and it is not paused. */
const isAnimating = (model: Model, chapterId: ChapterId, playback: Playback): boolean =>
  Option.contains(maybeOpenChapterId(model), chapterId) && playback._tag === 'Playing';

/** Like `setInterval`: the first tick lands one interval after the demo starts. */
const ticks = (isRunning: boolean, intervalMs: number, message: Message): Stream.Stream<Message> =>
  Stream.when(
    Stream.tick(Duration.millis(intervalMs)).pipe(
      Stream.drop(1),
      Stream.map(() => message),
    ),
    Effect.sync(() => isRunning),
  );

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  learnCreateCommandDemo: entry(
    { isRunning: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isRunning: isAnimating(model, 'create', model.createDemo.playback) }),
      dependenciesToStream: ({ isRunning }) =>
        ticks(isRunning, CREATE_COMMAND_TICK_MS, Message.TickedCreateCommandDemo()),
    },
  ),
  learnCreateScaffoldDemo: entry(
    { isRunning: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isRunning: isAnimating(model, 'create', model.createDemo.playback) }),
      dependenciesToStream: ({ isRunning }) =>
        ticks(isRunning, CREATE_SCAFFOLD_TICK_MS, Message.TickedCreateScaffoldDemo()),
    },
  ),
  learnPiDemo: entry(
    { isRunning: Schema.Boolean },
    {
      modelToDependencies: (model) => ({ isRunning: isAnimating(model, 'pi', model.piDemo.playback) }),
      dependenciesToStream: ({ isRunning }) => ticks(isRunning, PI_TICK_MS, Message.TickedPiDemo()),
    },
  ),
}));
