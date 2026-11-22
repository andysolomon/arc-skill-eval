import { Option, Schema, Stream } from 'effect';
import { Dom, Subscription } from 'foldkit';

import { Message } from './message';
import type { Model } from './model';

const isFormField = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT');

const caseStepKeys = Dom.streamFromEventFilterMapPreventDefault({
  target: window,
  type: 'keydown',
  filterMapEvent: (event: KeyboardEvent) => {
    if (isFormField(event.target)) {
      return Option.none();
    }
    if (event.key === 'j') {
      return Option.some(Message.PressedCaseStepKey({ step: 'next' }));
    }
    if (event.key === 'k') {
      return Option.some(Message.PressedCaseStepKey({ step: 'previous' }));
    }
    return Option.none();
  },
});

// SUBSCRIPTION

/** j / k step through the selected run's cases while a case is selected. */
export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
  browseCaseStepKeys: entry(
    { hasSelectedCase: Schema.Boolean },
    {
      modelToDependencies: (model) => ({
        hasSelectedCase: Option.isSome(model.maybeRunId) && Option.isSome(model.maybeCaseId),
      }),
      dependenciesToStream: ({ hasSelectedCase }) => (hasSelectedCase ? caseStepKeys : Stream.empty),
    },
  ),
}));
