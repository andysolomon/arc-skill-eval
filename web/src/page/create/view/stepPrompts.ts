import { Array, Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { EnvName } from '@/app/domain';
import { sx } from '@/ui/sx';

import { flavorColors, flavors, type BehaviorRow, type Flavor } from '../domain';
import { Message } from '../message';
import { SuggestTarget, isSuggestPending, type Model } from '../model';
import { maybeSuggestError, rowHeading, spacer, stepHeader, tinted } from './common';
import { assistButtonStyle, cardStyle, inputStyle, legendBoxStyle } from './styles';

const flavorLegend: ReadonlyArray<Readonly<{ flavor: Flavor; copy: string }>> = [
  { flavor: 'explicit', copy: 'Names the skill directly; use it as a smoke test' },
  { flavor: 'implicit', copy: 'Describes the scenario without naming the skill; tests the description' },
  { flavor: 'contextual', copy: 'Adds relevant context and unrelated details' },
  { flavor: 'adjacent-negative', copy: 'Defines a nearby request that must not trigger the skill' },
];

const legend = (h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.AriaLabel('prompt flavor legend'), h.Style(sx(legendBoxStyle))],
    Array.map(flavorLegend, (entry) =>
      h.div(
        [h.Style(sx({ display: 'flex', gap: 10 }))],
        [
          h.span(
            [h.Style(sx({ color: flavorColors[entry.flavor], flex: 'none', fontWeight: 700, width: 124 }))],
            [entry.flavor],
          ),
          h.span([h.Style(sx({ color: 'var(--tt-comment)' }))], [entry.copy]),
        ],
      ),
    ),
  );

const flavorButton = (row: BehaviorRow, flavor: Flavor, h: HtmlBuilder<Message>): Html => {
  const isActive = row.flavor === flavor;
  const tint = flavorColors[flavor];
  return h.button(
    [
      h.AriaPressed(String(isActive)),
      h.OnClick(Message.ClickedFlavor({ rowId: row.id, flavor })),
      h.Type('button'),
      h.Style(
        sx({
          background: 'transparent',
          border: `1px solid ${isActive ? tint : 'var(--tt-border)'}`,
          borderRadius: 5,
          color: isActive ? tint : 'var(--tt-comment)',
          cursor: 'pointer',
          fontSize: 11.5,
          padding: '3px 10px',
        }),
      ),
    ],
    [flavor],
  );
};

const promptCard = (model: Model, env: EnvName, row: BehaviorRow, h: HtmlBuilder<Message>): Html => {
  const isAnyPending = model.suggest._tag === 'Pending';
  const isClassifying = isSuggestPending(model.suggest, SuggestTarget.Flavor({ rowId: row.id }));
  const isSuggesting = isSuggestPending(model.suggest, SuggestTarget.Prompt({ rowId: row.id }));
  return h.keyed('div')(
    row.id,
    [h.Style(sx(cardStyle))],
    [
      rowHeading(row, h),
      h.textarea([
        h.AriaLabel(`prompt for ${row.text || 'unnamed behavior'}`),
        h.OnInput((value) => Message.UpdatedPrompt({ rowId: row.id, value })),
        h.Placeholder("Enter the user's request…"),
        h.Value(row.prompt),
        h.Style(sx(inputStyle, { height: 58, lineHeight: 1.5, padding: '9px 10px', resize: 'none', width: '100%' })),
      ]),
      h.div(
        [h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }))],
        [
          ...Array.map(flavors, (flavor) => flavorButton(row, flavor, h)),
          env === 'localhost' && row.prompt.trim() !== ''
            ? h.button(
                [
                  h.AriaLabel('classify flavor with LLM'),
                  h.Disabled(isAnyPending),
                  h.OnClick(Message.ClickedSuggestFlavor({ rowId: row.id })),
                  h.Title('classify flavor with LLM'),
                  h.Type('button'),
                  h.Style(sx(assistButtonStyle(isClassifying), { padding: '0 2px' })),
                ],
                [isClassifying ? '◌' : '✦'],
              )
            : h.empty,
          spacer(h),
          env === 'localhost'
            ? h.button(
                [
                  h.Disabled(isAnyPending),
                  h.OnClick(Message.ClickedSuggestPrompt({ rowId: row.id })),
                  h.Type('button'),
                  h.Style(sx(assistButtonStyle(isSuggesting))),
                ],
                [isSuggesting ? '◌ Generating…' : '✦ Suggest prompt'],
              )
            : h.empty,
        ],
      ),
    ],
  );
};

export const stepPrompts = (model: Model, env: EnvName, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      ...stepHeader(
        {
          kicker: 'step 02',
          title: 'Turn behaviors into prompts',
          intro: [
            'Write one user request for each behavior. Choose a prompt type to control how the case tests skill selection. Select ',
            tinted('Suggest', 'var(--tt-fg)', h),
            ' to draft a prompt.',
          ],
        },
        h,
      ),
      legend(h),
      ...Array.map(model.draft.behaviors, (row) => promptCard(model, env, row, h)),
      Option.match(maybeSuggestError(model.suggest), {
        onNone: () => h.empty,
        onSome: (error) => h.span([h.Role('alert'), h.Style(sx({ color: 'var(--tt-red)', fontSize: 13 }))], [error]),
      }),
    ],
  );
