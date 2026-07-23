import type { CSSProperties, ReactNode } from 'react';
import { color, radius, text, tracking } from '@/design/tokens';

export const pageStyle: CSSProperties = {
  margin: '0 auto',
  maxWidth: 960,
  padding: '32px 34px',
};

export const ChapterHeader = ({ num, title }: { num: string; title: string }) => (
  <header>
    <div
      style={{
        color: color.comment,
        fontSize: text['2xs'],
        letterSpacing: tracking.kickerWide,
        marginBottom: 6,
        textTransform: 'uppercase',
      }}
    >
      chapter {num}
    </div>
    <h1 style={{ color: color.fg, fontSize: text.xl, fontWeight: 700, margin: '0 0 10px' }}>
      {title}
    </h1>
  </header>
);

export const SectionKicker = ({
  children,
  style,
}: {
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      color: color.cyan,
      fontSize: text.sm,
      fontWeight: 700,
      letterSpacing: tracking.kicker,
      marginBottom: 12,
      textTransform: 'uppercase',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Callout = ({
  accent,
  children,
  style,
}: {
  accent: string;
  children: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    style={{
      background: color.bgDark,
      border: `1px solid ${color.border}`,
      borderLeft: `2px solid var(--tt-${accent})`,
      borderRadius: radius.xl,
      color: color.fgDark,
      fontSize: text.ui,
      lineHeight: 1.6,
      padding: '12px 16px',
      ...style,
    }}
  >
    {children}
  </div>
);

export const TrafficDots = () => (
  <>
    <span style={{ background: color.red, borderRadius: '50%', height: 9, width: 9 }} />
    <span style={{ background: color.yellow, borderRadius: '50%', height: 9, width: 9 }} />
    <span style={{ background: color.green, borderRadius: '50%', height: 9, width: 9 }} />
  </>
);

export const fadeStyle = (opacity: number, seconds = 0.35): CSSProperties => ({
  opacity,
  transition: `opacity ${seconds}s`,
});
