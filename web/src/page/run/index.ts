/**
 * PLACEHOLDER — replaced by the Run section port. Implements the page
 * contract documented in web/AGENTS.md.
 */

import { Schema, Stream } from 'effect';
import { Submodel, Subscription, type Update } from 'foldkit';
import { defineMessageUnion } from 'foldkit/message';

import type { AppContext, PageOutMessage } from '@/app/context';

// MODEL

export const Model = Schema.Struct({});
export type Model = typeof Model.Type;

// MESSAGE

export const Message = defineMessageUnion({
  ClickedPlaceholder: {},
});
export type Message = typeof Message.Type;

// INIT

export const init = (_context: AppContext): Update.Return<Model, Message> => ({ model: {} });

// UPDATE

export const update = (model: Model, message: Message, _context: AppContext) =>
  Message.match<Update.ReturnWithOutMessage<Model, Message, PageOutMessage>>(message, {
    ClickedPlaceholder: () => ({ model }),
  });

export const contextChanged = (model: Model, _context: AppContext): Update.Return<Model, Message> => ({ model });

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  runInert: entry(
    {},
    { modelToDependencies: () => ({}), dependenciesToStream: (): Stream.Stream<Message> => Stream.empty },
  ),
}));

// VIEW

export const view = Submodel.defineView<Model, Message, AppContext>((_model, _context, h) =>
  h.main([h.DataAttribute('testid', 'run-app')], [h.p([], ['Localhost only'])]),
);
