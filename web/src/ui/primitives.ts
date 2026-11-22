/**
 * Shared view helpers used by more than one page. Each takes the caller's
 * `h` (typed to the caller's Message) as its last parameter, so they work in
 * any Submodel view.
 */

import { Array } from 'effect';
import type { Html, HtmlBuilder } from 'foldkit/html';

import type { SectionName, ThemeName } from '@/app/domain';
import { color, text } from '@/design/tokens';
import { sx } from '@/ui/sx';

// KICKER

export type KickerTone = 'neutral' | 'accent' | 'warning';

const kickerToneColors: Record<KickerTone, string> = {
  neutral: color.comment,
  accent: color.cyan,
  warning: color.yellow,
};

/** Small uppercase label above a heading. `section` is the active section (AppContext.section). */
export const kicker = <Message>(
  config: Readonly<{ section: SectionName; tone?: KickerTone; content: ReadonlyArray<Html | string> | string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.p(
    [
      h.DataAttribute('section', config.section),
      h.Style(
        sx({
          color: kickerToneColors[config.tone ?? 'accent'],
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: text.sm,
          fontWeight: 700,
          letterSpacing: '0.06em',
          lineHeight: 1,
          margin: 0,
          textTransform: 'uppercase',
        }),
      ),
    ],
    typeof config.content === 'string' ? [config.content] : config.content,
  );

// COLUMN

export const gaps = {
  1: 'var(--tt-gap-1, 4px)',
  2: 'var(--tt-gap-2, 8px)',
  3: 'var(--tt-gap-3, 12px)',
  4: 'var(--tt-gap-4, 16px)',
  5: 'var(--tt-gap-5, 20px)',
  6: 'var(--tt-gap-6, 24px)',
} as const;

export type ColumnWidth = 'full' | 'auto' | number;

const resolveWidth = (width: ColumnWidth): string =>
  width === 'full' ? '100%' : width === 'auto' ? 'auto' : `${width}px`;

/** Vertical stack. `theme` is AppContext.theme (recorded as data-theme-variant). */
export const column = <Message>(
  config: Readonly<{ theme: ThemeName; gap?: keyof typeof gaps; width?: ColumnWidth }>,
  children: ReadonlyArray<Html>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.DataAttribute('theme-variant', config.theme),
      h.Style(
        sx({
          alignItems: 'stretch',
          display: 'flex',
          flexDirection: 'column',
          gap: gaps[config.gap ?? 3],
          width: resolveWidth(config.width ?? 'full'),
        }),
      ),
    ],
    children,
  );

// SKILL PICKER

/** Row of toggle buttons for choosing a skill (browse / review). */
export const skillPicker = <Message>(
  config: Readonly<{
    label: 'browsing' | 'reviewing';
    skillIds: ReadonlyArray<string>;
    selectedSkillId: string | undefined;
    onSelectSkill: (skillId: string) => Message;
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.AriaLabel(`${config.label} skill`),
      h.Role('group'),
      h.Style(sx({ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 8 })),
    ],
    [
      h.span([h.Style(sx({ color: 'var(--tt-comment)', fontSize: 12 }))], [`${config.label}:`]),
      ...Array.map(config.skillIds, (skillId) => {
        const isSelected = skillId === config.selectedSkillId;
        return h.keyed('button')(
          skillId,
          [
            h.AriaPressed(String(isSelected)),
            h.DataAttribute('testid', `${config.label}-skill-${skillId}`),
            h.OnClick(config.onSelectSkill(skillId)),
            h.Type('button'),
            h.Style(
              sx({
                background: isSelected ? 'color-mix(in srgb, var(--tt-teal) 14%, var(--tt-bg))' : 'transparent',
                border: `1px solid ${isSelected ? 'var(--tt-teal)' : 'var(--tt-border)'}`,
                borderRadius: 6,
                color: isSelected ? 'var(--tt-teal)' : 'var(--tt-fg-dark)',
                cursor: 'pointer',
                fontSize: 12,
                padding: '5px 11px',
              }),
            ),
          ],
          [skillId],
        );
      }),
    ],
  );
