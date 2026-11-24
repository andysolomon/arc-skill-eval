import { Stream } from 'effect';
import { Subscription } from 'foldkit';

import type { Message } from './message';
import type { Model } from './model';

export { Model } from './model';
export { Message } from './message';
export { contextChanged, init, update } from './update';
export { view } from './view';

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  reviewInert: entry(
    {},
    { modelToDependencies: () => ({}), dependenciesToStream: (): Stream.Stream<Message> => Stream.empty },
  ),
}));
