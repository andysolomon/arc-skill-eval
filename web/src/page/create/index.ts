import { Stream } from 'effect';
import { Subscription } from 'foldkit';

import type { Message as CreateMessage } from './message';
import type { Model as CreateModel } from './model';

export { Model } from './model';
export { Message } from './message';
export { init, update, contextChanged } from './update';
export { view } from './view';

// SUBSCRIPTION

export const subscriptions = Subscription.make<CreateModel, CreateMessage>()((entry) => ({
  createInert: entry(
    {},
    { modelToDependencies: () => ({}), dependenciesToStream: (): Stream.Stream<CreateMessage> => Stream.empty },
  ),
}));
