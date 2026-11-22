import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { EnvName } from '@/app/domain';
import { sx } from '@/ui/sx';

import { dimensionColors, dimensions, type BehaviorRow, type Dimension } from '../domain';
import { Message } from '../message';
import { SuggestTarget, isSuggestPending, type Model } from '../model';
import { maybeSuggestError, stepHeader } from './common';
import { assistButtonStyle, cardStyle, inputStyle, legendBoxStyle, removeGlyphStyle } from './styles';

const dimensionLegend: ReadonlyArray<Readonly<{ dim: Dimension; copy: string }>> = [
  { dim: 'outcome', copy: 'The task completes and produces the required artifact' },
  { dim: 'process', copy: 'The run uses the skill and follows the required steps' },
  { dim: 'style', copy: 'The output follows the required conventions' },
  { dim: 'efficiency', copy: 'Tool calls and token use stay within your limits' },
];

const legend = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaLabel('behavior dimensions'), h.Style(sx(legendBoxStyle))],
    Array.map(dimensionLegend, (entry) =>
      h.div(
        [h.Style(sx({ display: 'flex', gap: 10 }))],
        [
          h.span(
            [h.Style(sx({ color: dimensionColors[entry.dim], flex: 'none', fontWeight: 700, width: 76 }))],
            [entry.dim],
          ),
          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [entry.copy]),
        ],
      ),
    ),
  );

const skillField = (skill: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 22 }))],
    [
      h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))], ['skill']),
      h.span([h.Style(sx({ color: 'var(--tt-teal)', fontSize: 13 }))], ['./skills/']),
      h.input([
        h.AriaLabel('skill name'),
        h.OnInput((value) => Message.UpdatedSkill({ value })),
        h.Value(skill),
        h.Style(sx(inputStyle, { flex: 1 })),
      ]),
    ],
  );

const dimensionButton = (row: BehaviorRow, dim: Dimension, h: HtmlBuilder<Message>): Html => {
  const isActive = row.dim === dim;
  const tint = dimensionColors[dim];
  return h.button(
    [
      h.AriaPressed(String(isActive)),
      h.OnClick(Message.ClickedDimension({ rowId: row.id, dim })),
      h.Type('button'),
      h.Style(
        sx({
          background: isActive ? tint : 'transparent',
          border: `1px solid ${tint}`,
          borderRadius: 5,
          color: isActive ? 'var(--tt-bg-dark)' : tint,
          cursor: 'pointer',
          fontSize: 11.5,
          padding: '3px 10px',
        }),
      ),
    ],
    [dim],
  );
};

const behaviorCard = (model: Model, env: EnvName, row: BehaviorRow, h: HtmlBuilder<Message>): Html => {
  const isClassifying = isSuggestPending(model.suggest, SuggestTarget.Dimension({ rowId: row.id }));
  return h.keyed('div')(
    row.id,
    [h.Style(sx(cardStyle, { marginBottom: 10 }))],
    [
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 10 }))],
        [
          h.input([
            h.AriaLabel('behavior description'),
            h.OnInput((value) => Message.UpdatedBehaviorText({ rowId: row.id, value })),
            h.Placeholder('e.g. configures semantic-release with the conventional preset'),
            h.Value(row.text),
            h.Style(sx(inputStyle, { flex: 1, minWidth: 0 })),
          ]),
          model.draft.behaviors.length > 1
            ? h.button(
                [
                  h.AriaLabel('remove behavior'),
                  h.OnClick(Message.ClickedRemoveBehavior({ rowId: row.id })),
                  h.Type('button'),
                  h.Style(sx(removeGlyphStyle)),
                ],
                ['×'],
              )
            : h.empty,
        ],
      ),
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6 }))],
        [
          ...Array.map(dimensions, (dim) => dimensionButton(row, dim, h)),
          env === 'localhost' && row.text.trim() !== ''
            ? h.button(
                [
                  h.Disabled(model.suggest._tag === 'Pending'),
                  h.OnClick(Message.ClickedSuggestDimension({ rowId: row.id })),
                  h.Title('classify dimension with LLM'),
                  h.Type('button'),
                  h.Style(sx(assistButtonStyle(isClassifying), { marginLeft: 4 })),
                ],
                [isClassifying ? '◌' : '✦'],
              )
            : h.empty,
        ],
      ),
    ],
  );
};

const emptyState = (env: EnvName, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          border: '1px dashed var(--tt-border)',
          borderRadius: 8,
          color: 'var(--tt-comment)',
          fontSize: 12.5,
          lineHeight: 1.55,
          marginBottom: 10,
          padding: 16,
          textAlign: 'center',
        }),
      ),
    ],
    [
      env === 'localhost'
        ? 'No behaviors yet. Draft them from a skill above, or add one below.'
        : 'No behaviors yet. Add one below.',
    ],
  );

const actions = (model: Model, env: EnvName, h: HtmlBuilder<Message>): Html => {
  const isSuggesting = isSuggestPending(model.suggest, SuggestTarget.Behavior());
  return h.div(
    [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 14 }))],
    [
      h.button(
        [
          h.OnClick(Message.ClickedAddBehavior()),
          h.Type('button'),
          h.Style(
            sx({
              alignItems: 'center',
              background: 'transparent',
              border: '1px dashed var(--tt-border)',
              borderRadius: 7,
              color: 'var(--tt-fg-dark)',
              cursor: 'pointer',
              display: 'inline-flex',
              fontSize: 12.5,
              gap: 7,
              padding: '8px 13px',
            }),
          ),
        ],
        ['＋ Add behavior'],
      ),
      env === 'localhost'
        ? h.button(
            [
              h.Disabled(isSuggesting),
              h.OnClick(Message.ClickedSuggestBehavior()),
              h.Type('button'),
              h.Style(sx(assistButtonStyle(isSuggesting))),
            ],
            [isSuggesting ? '◌ Generating…' : '✦ Suggest a behavior'],
          )
        : h.empty,
    ],
  );
};

export const stepBehaviors = (model: Model, env: EnvName, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      ...stepHeader(
        {
          kicker: 'step 01',
          title: 'List required behaviors',
          intro: [
            'Write each behavior that must pass in plain language, then choose its dimension. You will turn these behaviors into test cases next.',
          ],
        },
        h,
      ),
      legend(h),
      skillField(model.draft.skill, h),
      h.div(
        [
          h.Style(
            sx({
              color: 'var(--tt-cyan)',
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: '.05em',
              marginBottom: 10,
              textTransform: 'uppercase',
            }),
          ),
        ],
        ['behaviors'],
      ),
      ...Array.map(model.draft.behaviors, (row) => behaviorCard(model, env, row, h)),
      Array.isReadonlyArrayEmpty(model.draft.behaviors) ? emptyState(env, h) : h.empty,
      actions(model, env, h),
      Option.match(maybeSuggestError(model.suggest), {
        onNone: () => h.empty,
        onSome: (error) =>
          h.div([h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 12, marginTop: 8 }))], [error]),
      }),
    ],
  );
