import { Array, Option } from 'effect';

import type { ReviewRun } from '../domain';

export const passCount = (run: ReviewRun): number =>
  Array.filter(run.cases, (testCase) => testCase.status === 'pass').length;

export const rateColor = (passed: number, total: number): string =>
  total > 0 && passed >= total ? 'var(--tt-green)' : passed <= 0 ? 'var(--tt-red)' : 'var(--tt-orange)';

/** Enter / Space activate a `role="button"` card, like a native button. */
export const activationKey =
  <Message>(message: Message) =>
  (key: string): Option.Option<Message> =>
    key === 'Enter' || key === ' ' ? Option.some(message) : Option.none();
