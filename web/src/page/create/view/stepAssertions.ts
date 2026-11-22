import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { EnvName } from '@/app/domain';
import { sx } from '@/ui/sx';

import {
  assertionKindColor,
  assertionKinds,
  assertionPlaceholder,
  type BehaviorAssertion,
  type BehaviorRow,
} from '../domain';
import { Message } from '../message';
import { SuggestTarget, isSuggestPending, type Model } from '../model';
import { maybeSuggestError, rowHeading, spacer, stepHeader, tinted } from './common';
import { assistButtonStyle, cardStyle, inputStyle, legendBoxStyle, removeGlyphStyle } from './styles';

const exampleRow = (mark: string, markColor: string, copy: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ display: 'flex', gap: 10 }))],
    [
      h.span([h.Style(sx({ color: markColor, flex: 'none', fontWeight: 700, width: 20 }))], [mark]),
      h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [copy]),
    ],
  );

const examples = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaLabel('assertion examples'), h.Style(sx(legendBoxStyle))],
    [
      exampleRow(
        '✓',
        'var(--tt-green)',
        '"The workflow triggers on pull_request" is one observable claim that you can check the same way twice',
        h,
      ),
      exampleRow(
        '✗',
        'var(--tt-red)',
        '"The output is good" is too vague to grade. "Says exactly: setup complete" is too brittle because a correct paraphrase fails.',
        h,
      ),
    ],
  );

const assertionRow = (row: BehaviorRow, assertion: BehaviorAssertion, index: number, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 7 }))],
    [
      h.span(
        [
          h.Style(
            sx({
              color: assertionKindColor(assertion.kind),
              flex: 'none',
              fontSize: 11.5,
              lineHeight: 1.3,
              width: 112,
              wordBreak: 'break-word',
            }),
          ),
        ],
        [assertion.kind],
      ),
      h.input([
        h.AriaLabel(`${assertion.kind} assertion`),
        h.OnInput((value) => Message.UpdatedAssertionValue({ rowId: row.id, index, value })),
        h.Placeholder(assertionPlaceholder(assertion.kind)),
        h.Value(assertion.val),
        h.Style(sx(inputStyle, { flex: 1, fontSize: 12.5, minWidth: 0, padding: '7px 10px' })),
      ]),
      h.button(
        [
          h.AriaLabel('remove assertion'),
          h.OnClick(Message.ClickedRemoveAssertion({ rowId: row.id, index })),
          h.Type('button'),
          h.Style(sx(removeGlyphStyle, { fontSize: 15 })),
        ],
        ['×'],
      ),
    ],
  );

const assertionCard = (model: Model, env: EnvName, row: BehaviorRow, h: HtmlBuilder<Message>): Html => {
  const isSuggesting = isSuggestPending(model.suggest, SuggestTarget.Assertion({ rowId: row.id }));
  return h.keyed('div')(
    row.id,
    [h.Style(sx(cardStyle))],
    [
      rowHeading(row, h),
      Array.isReadonlyArrayEmpty(row.asserts)
        ? h.div(
            [h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12, padding: '4px 0 10px' }))],
            ['No checks yet. Add one below.'],
          )
        : h.empty,
      ...Array.map(row.asserts, (assertion, index) => assertionRow(row, assertion, index, h)),
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }))],
        [
          ...Array.map(assertionKinds, (kind) =>
            h.button(
              [
                h.OnClick(Message.ClickedAddAssertion({ rowId: row.id, kind })),
                h.Type('button'),
                h.Style(
                  sx({
                    background: 'transparent',
                    border: '1px dashed var(--tt-border)',
                    borderRadius: 5,
                    color: assertionKindColor(kind),
                    cursor: 'pointer',
                    fontSize: 11,
                    padding: '3px 9px',
                  }),
                ),
              ],
              ['＋ ', kind],
            ),
          ),
          ...(env === 'localhost'
            ? [
                spacer(h),
                h.button(
                  [
                    h.Disabled(model.suggest._tag === 'Pending'),
                    h.OnClick(Message.ClickedSuggestAssertion({ rowId: row.id })),
                    h.Type('button'),
                    h.Style(sx(assistButtonStyle(isSuggesting))),
                  ],
                  [isSuggesting ? '◌ Generating…' : '✦ Suggest an assertion'],
                ),
              ]
            : []),
        ],
      ),
    ],
  );
};

export const stepAssertions = (model: Model, env: EnvName, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      ...stepHeader(
        {
          kicker: 'step 03',
          title: 'Attach assertions',
          intro: [
            'Add checks that decide whether each case passes. Use',
            ' ',
            tinted('deterministic', 'var(--tt-cyan)', h),
            ' checks when a script can verify the result. Use a ',
            tinted('judge', 'var(--tt-magenta)', h),
            ' for prose that requires interpretation.',
          ],
        },
        h,
      ),
      examples(h),
      ...Array.map(model.draft.behaviors, (row) => assertionCard(model, env, row, h)),
      Option.match(maybeSuggestError(model.suggest), {
        onNone: () => h.empty,
        onSome: (error) => h.div([h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 12 }))], [error]),
      }),
    ],
  );
