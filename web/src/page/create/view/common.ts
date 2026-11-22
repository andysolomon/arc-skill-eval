import { Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import { dimensionColors, type BehaviorRow } from '../domain';
import type { Message } from '../message';
import type { Suggest } from '../model';
import { introStyle, kickerStyle, titleStyle } from './styles';

export const stepHeader = (
  config: Readonly<{ kicker: string; title: string; intro: ReadonlyArray<Html | string>; introMarginBottom?: number }>,
  h: HtmlBuilder<Message>,
): ReadonlyArray<Html> => [
  h.div([h.Style(sx(kickerStyle))], [config.kicker]),
  h.h1([h.Style(sx(titleStyle))], [config.title]),
  h.p(
    [h.Style(sx(introStyle, config.introMarginBottom === undefined ? undefined : { marginBottom: config.introMarginBottom }))],
    config.intro,
  ),
];

export const tinted = (content: string, tint: string, h: HtmlBuilder<Message>): Html =>
  h.span([h.Style(sx({ color: tint }))], [content]);

/** Colored dot + behavior text heading a prompt or assertion card. */
export const rowHeading = (row: BehaviorRow, h: HtmlBuilder<Message>): Html =>
  h.div(
    [h.Style(sx({ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 10 }))],
    [
      h.span([
        h.AriaHidden(true),
        h.Style(
          sx({ background: dimensionColors[row.dim], borderRadius: '50%', flex: 'none', height: 7, width: 7 }),
        ),
      ]),
      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)', fontSize: 12.5 }))], [row.text || '(unnamed behavior)']),
    ],
  );

export const maybeSuggestError = (suggest: Suggest): Option.Option<string> =>
  suggest._tag === 'Failed' && suggest.error !== '' ? Option.some(suggest.error) : Option.none();

export const spacer = (h: HtmlBuilder<Message>): Html => h.span([h.Style(sx({ flex: 1 }))]);
