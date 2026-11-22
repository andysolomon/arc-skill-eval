import { Option } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import { sx } from '@/ui/sx';

import type { Message } from '../message';

// VIEW

/** A rail row that acts as a toggle button (click, Enter or Space). */
export const selectableRow = (
  config: Readonly<{
    key: string;
    label: string;
    title: string;
    isSelected: boolean;
    onSelect: Message;
    glyph: string;
    glyphColor: string;
    textColor: string;
    trailing: ReadonlyArray<Html>;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.keyed('div')(
    config.key,
    [
      h.AriaLabel(config.label),
      h.AriaPressed(String(config.isSelected)),
      h.OnClick(config.onSelect),
      h.OnKeyDownPreventDefault((key) =>
        key === 'Enter' || key === ' ' ? Option.some(config.onSelect) : Option.none(),
      ),
      h.Role('button'),
      h.Tabindex(0),
      h.Title(config.title),
      h.Style(
        sx({
          alignItems: 'center',
          background: config.isSelected ? 'var(--tt-selection)' : 'transparent',
          cursor: 'pointer',
          display: 'flex',
          gap: 6,
          height: 24,
          minWidth: 0,
          padding: '0 8px',
        }),
      ),
    ],
    [
      h.span(
        [h.AriaHidden(true), h.Style(sx({ color: config.isSelected ? 'var(--tt-blue)' : 'transparent', width: 6 }))],
        ['▌'],
      ),
      h.span([h.AriaHidden(true), h.Style(sx({ color: config.glyphColor, fontWeight: 700, width: 12 }))], [config.glyph]),
      h.span(
        [
          h.Style(
            sx({
              color: config.textColor,
              flex: 1,
              fontSize: 13,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }),
          ),
        ],
        [config.key],
      ),
      ...config.trailing,
    ],
  );

/** The bar at the top of a rail panel: a title and a count. */
export const panelHeader = (title: string, count: string, h: HtmlBuilder<Message>): Html =>
  h.div(
    [
      h.Style(
        sx({
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          fontSize: 12,
          justifyContent: 'space-between',
          padding: '4px 10px',
        }),
      ),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-fg-dark)' }))], [title]),
      h.span([h.Style(sx({ color: 'var(--tt-dim)' }))], [count]),
    ],
  );
