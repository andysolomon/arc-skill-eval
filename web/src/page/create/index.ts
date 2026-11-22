/**
 * Create section: a four-step wizard (behaviors → prompts → assertions →
 * review) that builds evals/evals.json with a live preview. The draft and
 * current step are saved to IndexedDB and restored in `init`. Hosted mode
 * downloads the file; localhost drafts and suggests with the daemon and
 * writes through a staged plan. Implements the page contract in web/AGENTS.md.
 */

import { Stream } from 'effect';
import { Subscription } from 'foldkit';

import type { Message as CreateMessage } from './message';
import type { Model as CreateModel } from './model';

export { Model } from './model';
export { Message } from './message';
export { init, update, contextChanged } from './update';
export { view } from './view';

// SUBSCRIPTION

/** The wizard has no external event sources; the entry satisfies the page contract. */
export const subscriptions = Subscription.make<CreateModel, CreateMessage>()((entry) => ({
  createInert: entry(
    {},
    { modelToDependencies: () => ({}), dependenciesToStream: (): Stream.Stream<CreateMessage> => Stream.empty },
  ),
}));
