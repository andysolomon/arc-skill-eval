import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { ReviewCase, ReviewCaseStatus, ReviewRun } from '../domain';
import { Message } from '../message';
import { activationKey, passCount, rateColor } from './shared';

const BAR_WIDTH = 12;

const statusGlyph = (status: ReviewCaseStatus): string =>
  status === 'pass' ? '✓' : status === 'fail' ? '✗' : status === 'partial' ? '◐' : '◌';

const statusColor = (status: ReviewCaseStatus): string =>
  status === 'pass'
    ? 'var(--tt-green)'
    : status === 'fail'
      ? 'var(--tt-red)'
      : status === 'partial'
        ? 'var(--tt-orange)'
        : 'var(--tt-comment)';

const asciiBar = (passed: number, total: number, width: number) => {
  const filled = total > 0 ? Math.max(0, Math.min(width, Math.round((passed / total) * width))) : 0;
  return { fill: '▓'.repeat(filled), rest: '░'.repeat(width - filled) };
};

type CompareCounts = Readonly<{
  withPassed: number;
  withTotal: number;
  maybeWithoutPassed: Option.Option<number>;
  maybeWithoutTotal: Option.Option<number>;
}>;

const compareCounts = (testCase: ReviewCase): CompareCounts => {
  const withTotal = Option.getOrElse(testCase.maybeWithTotal, () => (testCase.status === 'partial' ? 2 : 1));
  const withPassed = Option.getOrElse(testCase.maybeWithPassed, () =>
    testCase.status === 'pass' ? withTotal : testCase.status === 'partial' ? 1 : 0,
  );
  return {
    withPassed,
    withTotal,
    maybeWithoutPassed: testCase.maybeWithoutPassed,
    maybeWithoutTotal: testCase.maybeWithoutTotal,
  };
};

const deltaText = (testCase: ReviewCase): string =>
  Option.getOrElse(testCase.maybeDelta, () => {
    const { withPassed, withTotal, maybeWithoutPassed, maybeWithoutTotal } = compareCounts(testCase);
    if (Option.isNone(maybeWithoutPassed) || Option.isNone(maybeWithoutTotal)) {
      return 'n/a';
    }
    if (withTotal === 0 || maybeWithoutTotal.value === 0) {
      return 'n/a';
    }
    const delta = (withPassed / withTotal - maybeWithoutPassed.value / maybeWithoutTotal.value) * 100;
    return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
  });

const deltaColor = (delta: string): string =>
  delta === 'n/a' || delta === '+0.0%'
    ? 'var(--tt-comment)'
    : delta.startsWith('-')
      ? 'var(--tt-red)'
      : 'var(--tt-green)';

const compareRow = (
  config: Readonly<{ color: string; label: string; maybePassed: Option.Option<number>; maybeTotal: Option.Option<number> }>,
  h: HtmlBuilder<Message>,
): Html => {
  const maybeCounts = Option.all({ passed: config.maybePassed, total: config.maybeTotal });
  const bar = Option.match(maybeCounts, {
    onNone: () => asciiBar(0, 1, BAR_WIDTH),
    onSome: ({ passed, total }) => asciiBar(passed, total, BAR_WIDTH),
  });

  return h.div(
    [],
    [
      h.span([h.Style(sx({ color: 'var(--tt-comment)', display: 'inline-block', width: '14ch' }))], [config.label]),
      h.span([h.Style(sx({ color: config.color }))], [bar.fill]),
      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], [bar.rest]),
      h.span(
        [h.Style(sx({ color: Option.isSome(maybeCounts) ? config.color : 'var(--tt-comment)' }))],
        [
          Option.match(maybeCounts, {
            onNone: () => ' n/a',
            onSome: ({ passed, total }) => ` ${passed}/${total}`,
          }),
        ],
      ),
    ],
  );
};

const failureText = (testCase: ReviewCase): Option.Option<string> => {
  const hasText = (maybeText: Option.Option<string>) => Option.exists(maybeText, (text) => text !== '');
  return testCase.status === 'fail' && (hasText(testCase.maybeFailureEvidence) || hasText(testCase.maybeOutput))
    ? Option.orElse(testCase.maybeFailureEvidence, () => testCase.maybeOutput)
    : Option.none();
};

const caseCard = (testCase: ReviewCase, isSelected: boolean, h: HtmlBuilder<Message>): Html => {
  const delta = deltaText(testCase);
  const counts = compareCounts(testCase);

  return h.keyed('div')(
    testCase.id,
    [
      h.AriaLabel(`select case ${testCase.id}`),
      h.AriaPressed(String(isSelected)),
      h.OnClick(Message.SelectedCase({ caseId: testCase.id })),
      h.OnKeyDownPreventDefault(activationKey(Message.SelectedCase({ caseId: testCase.id }))),
      h.Role('button'),
      h.Tabindex(0),
      h.Style(
        sx({
          background: isSelected ? 'var(--tt-bg-hi)' : 'transparent',
          border: `1px solid ${isSelected ? 'var(--tt-border-active)' : 'var(--tt-border)'}`,
          borderRadius: 7,
          cursor: 'pointer',
          marginBottom: 10,
          minWidth: 0,
          padding: '11px 13px',
        }),
      ),
    ],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 6 }))],
        [
          h.span(
            [h.AriaHidden(true), h.Style(sx({ color: statusColor(testCase.status), fontWeight: 700 }))],
            [statusGlyph(testCase.status)],
          ),
          h.span([h.Style(sx({ color: 'var(--tt-fg)', fontSize: 13, fontWeight: 700 }))], [testCase.id]),
          h.span([h.Style(sx({ flex: 1 }))]),
          h.span([h.Style(sx({ color: deltaColor(delta), fontSize: 12, fontWeight: 700 }))], [`Δ ${delta}`]),
        ],
      ),
      h.div([h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5, marginBottom: 8 }))], [testCase.prompt]),
      h.div(
        [h.Style(sx({ fontSize: 12.5, lineHeight: 1.8 }))],
        [
          compareRow(
            {
              color: 'var(--tt-green)',
              label: 'with_skill',
              maybePassed: Option.some(counts.withPassed),
              maybeTotal: Option.some(counts.withTotal),
            },
            h,
          ),
          compareRow(
            {
              color: 'var(--tt-orange)',
              label: 'without_skill',
              maybePassed: counts.maybeWithoutPassed,
              maybeTotal: counts.maybeWithoutTotal,
            },
            h,
          ),
        ],
      ),
      Option.match(failureText(testCase), {
        onNone: () => h.empty,
        onSome: (text) => h.div([h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, marginTop: 8 }))], [`✗ ${text}`]),
      }),
    ],
  );
};

export const summary = (run: ReviewRun, maybeSelectedCaseId: Option.Option<string>, h: HtmlBuilder<Message>): Html => {
  const passed = passCount(run);

  return h.section(
    [
      h.AriaLabelledBy('review-summary-title'),
      h.Style(
        sx({
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flex: 1,
          flexDirection: 'column',
          minHeight: 0,
          minWidth: 0,
          overflow: 'hidden',
        }),
      ),
    ],
    [
      h.header(
        [
          h.Style(
            sx({
              alignItems: 'center',
              background: 'var(--tt-bg-dark)',
              borderBottom: '1px solid var(--tt-border)',
              display: 'flex',
              fontSize: 12,
              gap: 12,
              padding: '7px 16px',
            }),
          ),
        ],
        [
          h.h1(
            [
              h.Id('review-summary-title'),
              h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12, fontWeight: 700, margin: 0 })),
            ],
            ['review.html'],
          ),
          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [run.skill]),
          h.span([h.Style(sx({ flex: 1 }))]),
          h.span(
            [h.Style(sx({ color: rateColor(passed, run.cases.length) }))],
            [`${passed}/${run.cases.length} passed`],
          ),
        ],
      ),
      h.div(
        [h.Style(sx({ flex: 1, overflow: 'auto', padding: '14px 18px' }))],
        Array.map(run.cases, (testCase) =>
          caseCard(testCase, Option.contains(maybeSelectedCaseId, testCase.id), h),
        ),
      ),
    ],
  );
};
