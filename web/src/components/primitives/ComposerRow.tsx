import type { ReactNode } from 'react';
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
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
      }}
    >
      <button
        aria-expanded={isOpen}
        onClick={onToggle}
        type="button"
        style={{
          alignItems: 'center',
          background: 'var(--tt-bg-dark)',
          border: 0,
          color: 'var(--tt-fg)',
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
        <span style={{ color: 'var(--tt-comment)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12 }}>
          {label}
        </span>
        <span style={{ color: 'var(--tt-cyan)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 13 }}>
          {value}
        </span>
        <span
          aria-hidden="true"
          style={{
            color: 'var(--tt-comment)',
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
            borderTop: '1px solid var(--tt-border)',
            color: 'var(--tt-fg-dark)',
            padding: 12,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
};
