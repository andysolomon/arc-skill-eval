import type { Html, HtmlBuilder } from 'foldkit/html';

import { color, radius, text, tracking } from '@/design/tokens';
import { sx, type StyleInput } from '@/ui/sx';

export type Child = Html | string;
export type Children = ReadonlyArray<Child>;

export const pageStyle: StyleInput = {
  margin: '0 auto',
  maxWidth: 960,
  padding: '32px 34px',
};

export const chapterHeader = <Message>(
  config: Readonly<{ num: string; title: string }>,
  h: HtmlBuilder<Message>,
): Html =>
  h.header(
    [],
    [
      h.div(
        [
          h.Style(
            sx({
              color: color.comment,
              fontSize: text['2xs'],
              letterSpacing: tracking.kickerWide,
              marginBottom: 6,
              textTransform: 'uppercase',
            }),
          ),
        ],
        [`chapter ${config.num}`],
      ),
      h.h1([h.Style(sx({ color: color.fg, fontSize: text.xl, fontWeight: 700, margin: '0 0 10px' }))], [config.title]),
    ],
  );

export const sectionKicker = <Message>(
  config: Readonly<{ style?: StyleInput }>,
  children: Children,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style(
        sx(
          {
            color: color.cyan,
            fontSize: text.sm,
            fontWeight: 700,
            letterSpacing: tracking.kicker,
            marginBottom: 12,
            textTransform: 'uppercase',
          },
          config.style,
        ),
      ),
    ],
    children,
  );

export const callout = <Message>(
  config: Readonly<{ accent: string; style?: StyleInput }>,
  children: Children,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    [
      h.Style(
        sx(
          {
            background: color.bgDark,
            border: `1px solid ${color.border}`,
            borderLeft: `2px solid var(--tt-${config.accent})`,
            borderRadius: radius.xl,
            color: color.fgDark,
            fontSize: text.ui,
            lineHeight: 1.6,
            padding: '12px 16px',
          },
          config.style,
        ),
      ),
    ],
    children,
  );

const dot = <Message>(background: string, h: HtmlBuilder<Message>): Html =>
  h.span([h.Style(sx({ background, borderRadius: '50%', height: 9, width: 9 }))]);

export const trafficDots = <Message>(h: HtmlBuilder<Message>): Children => [
  dot(color.red, h),
  dot(color.yellow, h),
  dot(color.green, h),
];

export const fadeStyle = (opacity: number, seconds = 0.35): StyleInput => ({
  opacity,
  transition: `opacity ${seconds}s`,
});
