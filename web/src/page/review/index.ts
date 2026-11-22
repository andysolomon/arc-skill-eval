/**
 * Review section: import run JSON (hosted) or read runs from disk through
 * the daemon (localhost), inspect cases, record feedback notes, and turn
 * them into a change plan (downloaded on hosted, staged and applied on
 * localhost). Implements the page contract in web/AGENTS.md.
 */

import { Stream } from 'effect';
import { Subscription } from 'foldkit';

import type { Message } from './message';
import type { Model } from './model';

export { Model } from './model';
export { Message } from './message';
export { contextChanged, init, update } from './update';
export { view } from './view';

// SUBSCRIPTION

// NOTE: Review listens to nothing outside its own events. The inert entry
// keeps the Model and Message types inferable where the root lifts it.
export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  reviewInert: entry(
    {},
    { modelToDependencies: () => ({}), dependenciesToStream: (): Stream.Stream<Message> => Stream.empty },
  ),
}));
