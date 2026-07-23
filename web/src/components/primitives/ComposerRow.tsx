import type { ReactNode } from 'react';
import { color, text } from '@/design/tokens';
import { useSection } from '@/state/section';

export type ComposerRowProps = {
  label: string;
  value: string;
  isOpen: boolean;
  onToggle: () => void;
  children?: ReactNode;
};

export const ComposerRow = ({ label, value, isOpen, onToggle, children }: ComposerRowProps) => {
  const { activeSection } = useSection();

  return (
    <div
      data-open={isOpen}
      data-section={activeSection.name}
      style={{
        background: color.bgDark,
        border: `1px solid ${color.border}`,
        color: color.fg,
      }}
    >
      <button
        aria-expanded={isOpen}
        onClick={onToggle}
        type="button"
        style={{
          alignItems: 'center',
          background: color.bgDark,
          border: 0,
          color: color.fg,
          cursor: 'pointer',
          display: 'grid',
          gap: 'var(--tt-gap-3, 12px)',
          gridTemplateColumns: 'minmax(0, 1fr) auto auto',
          minHeight: 42,
          padding: '0 12px',
          textAlign: 'left',
          width: '100%',
        }}
      >
        <span style={{ color: color.comment, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: text.sm }}>
          {label}
        </span>
        <span style={{ color: color.cyan, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: text.body }}>
          {value}
        </span>
        <span
          aria-hidden="true"
          style={{
            color: color.comment,
            display: 'inline-block',
            transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 120ms ease',
          }}
        >
          &gt;
        </span>
      </button>
      {isOpen ? (
        <div
          style={{
            borderTop: `1px solid ${color.border}`,
            color: color.fgDark,
            padding: 12,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
};
