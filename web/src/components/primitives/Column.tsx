import type { CSSProperties, ReactNode } from 'react';
import { useTheme } from '@/state/theme';

export const gaps = {
  1: 'var(--tt-gap-1, 4px)',
  2: 'var(--tt-gap-2, 8px)',
  3: 'var(--tt-gap-3, 12px)',
  4: 'var(--tt-gap-4, 16px)',
  5: 'var(--tt-gap-5, 20px)',
  6: 'var(--tt-gap-6, 24px)',
} as const;

type ColumnWidth = 'full' | 'auto' | number;

export type ColumnProps = {
  gap?: keyof typeof gaps;
  width?: ColumnWidth;
  children: ReactNode;
};

const resolveWidth = (width: ColumnWidth): CSSProperties['width'] => {
  if (width === 'full') {
    return '100%';
  }

  if (width === 'auto') {
    return 'auto';
  }

  return `${width}px`;
};

export const Column = ({ gap = 3, width = 'full', children }: ColumnProps) => {
  const { theme } = useTheme();

  return (
    <div
      data-theme-variant={theme}
      style={{
        alignItems: 'stretch',
        display: 'flex',
        flexDirection: 'column',
        gap: gaps[gap],
        width: resolveWidth(width),
      }}
    >
      {children}
    </div>
  );
};
