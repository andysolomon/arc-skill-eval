import type { ReactNode } from 'react';
import { useSection } from '@/state/section';

type KickerTone = 'neutral' | 'accent' | 'warning';

export type KickerProps = {
  children: ReactNode;
  tone?: KickerTone;
};

const toneColors: Record<KickerTone, string> = {
  neutral: 'var(--tt-comment)',
  accent: 'var(--tt-cyan)',
  warning: 'var(--tt-yellow)',
};

export const Kicker = ({ children, tone = 'accent' }: KickerProps) => {
  const { activeSection } = useSection();

  return (
    <p
      data-section={activeSection.name}
      style={{
        color: toneColors[tone],
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.06em',
        lineHeight: 1,
        margin: 0,
        textTransform: 'uppercase',
      }}
    >
      {children}
    </p>
  );
};
