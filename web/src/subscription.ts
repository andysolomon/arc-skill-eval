import { Array, Option } from 'effect';
import { Dom, Subscription } from 'foldkit';

import { sections } from '@/app/domain';
import { Message } from '@/message';
import type { Model } from '@/model';
import * as Browse from '@/page/browse';
import * as Create from '@/page/create';
import * as Learn from '@/page/learn';
import * as Review from '@/page/review';
import * as Run from '@/page/run';
import * as Workspace from '@/shell/workspace';

const isTypingTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
};

const shellSubscriptions = Subscription.make<Model, Message>()(() => ({
  sectionHotkeys: Subscription.persistentEntry(
    Dom.streamFromEventFilterMap({
      target: window,
      type: 'keydown',
      filterMapEvent: (event: KeyboardEvent) =>
        isTypingTarget(event.target)
          ? Option.none()
          : Array.findFirst(sections, (section) => String(section.index) === event.key).pipe(
              Option.map((section) => Message.PressedSectionKey({ section: section.name })),
            ),
    }),
  ),
}));

const workspaceSubscriptions = Subscription.lift(Workspace.subscriptions)<Model, Message>({
  read: (model) => Option.some(model.workspace),
  toParentMessage: (message) => Message.GotWorkspaceMessage({ message }),
});

const runSubscriptions = Subscription.lift(Run.subscriptions)<Model, Message>({
  read: (model) => (model.page._tag === 'Run' ? Option.some(model.page.model) : Option.none()),
  toParentMessage: (message) => Message.GotRunMessage({ message }),
});

const browseSubscriptions = Subscription.lift(Browse.subscriptions)<Model, Message>({
  read: (model) => (model.page._tag === 'Browse' ? Option.some(model.page.model) : Option.none()),
  toParentMessage: (message) => Message.GotBrowseMessage({ message }),
});

const createSubscriptions = Subscription.lift(Create.subscriptions)<Model, Message>({
  read: (model) => (model.page._tag === 'Create' ? Option.some(model.page.model) : Option.none()),
  toParentMessage: (message) => Message.GotCreateMessage({ message }),
});

const reviewSubscriptions = Subscription.lift(Review.subscriptions)<Model, Message>({
  read: (model) => (model.page._tag === 'Review' ? Option.some(model.page.model) : Option.none()),
  toParentMessage: (message) => Message.GotReviewMessage({ message }),
});

const learnSubscriptions = Subscription.lift(Learn.subscriptions)<Model, Message>({
  read: (model) => (model.page._tag === 'Learn' ? Option.some(model.page.model) : Option.none()),
  toParentMessage: (message) => Message.GotLearnMessage({ message }),
});

export const subscriptions = Subscription.aggregate(
  shellSubscriptions,
  workspaceSubscriptions,
  runSubscriptions,
  browseSubscriptions,
  createSubscriptions,
  reviewSubscriptions,
  learnSubscriptions,
);
