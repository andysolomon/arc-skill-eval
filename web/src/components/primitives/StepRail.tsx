import { color, text } from '@/design/tokens';
import { useSection } from '@/state/section';
import { Kicker } from './Kicker';

export type StepRailStep = {
  id: string;
  label: string;
};

export type StepRailProps = {
  steps: StepRailStep[];
  activeId: string;
  onSelect: (id: string) => void;
};

export const StepRail = ({ steps, activeId, onSelect }: StepRailProps) => {
  const { activeSection } = useSection();

  return (
    <nav
      aria-label="create steps"
      data-section={activeSection.name}
      style={{
        background: color.bgDark,
        border: `1px solid ${color.border}`,
        color: color.fg,
        display: 'grid',
        gap: 'var(--tt-gap-3, 12px)',
        padding: 12,
        width: 214,
      }}
    >
      <Kicker tone="neutral">new eval suite</Kicker>
      <ol style={{ display: 'grid', gap: 'var(--tt-gap-1, 4px)', listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map((step, index) => {
          const isActive = step.id === activeId;

          return (
            <li key={step.id}>
              <button
                aria-current={isActive ? 'step' : undefined}
                onClick={() => onSelect(step.id)}
                type="button"
                style={{
                  alignItems: 'center',
                  background: isActive ? color.selection : color.bgDark,
                  border: 0,
                  borderLeft: `3px solid ${isActive ? color.cyan : color.border}`,
                  color: isActive ? color.fg : color.fgDark,
                  cursor: 'pointer',
                  display: 'grid',
                  gap: 'var(--tt-gap-2, 8px)',
                  gridTemplateColumns: '24px minmax(0, 1fr)',
                  minHeight: 36,
                  padding: '6px 8px',
                  textAlign: 'left',
                  width: '100%',
                }}
              >
                <span style={{ color: color.comment, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: text.sm }}>
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span style={{ overflowWrap: 'anywhere' }}>{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p style={{ color: color.comment, fontSize: text.sm, lineHeight: 1.4, margin: 0 }}>
        mirrors the learn flow
      </p>
    </nav>
  );
};
