import { resetHostedData } from '@/persistence/db';
import { useSection } from '@/state/section';

type StatusHint = { key: string; label: string };

const statusHints: Record<string, StatusHint[]> = {
  run: [
    { key: '▶', label: 'run' },
    { key: 'R', label: 'compare' },
    { key: '1-5', label: 'nav' },
  ],
  browse: [
    { key: '↑↓', label: 'select' },
    { key: '[ ]', label: 'mode' },
    { key: 'v', label: 'raw' },
  ],
  create: [
    { key: '↑↓', label: 'case' },
    { key: 'space', label: 'toggle' },
  ],
  review: [
    { key: 'f', label: 'feedback' },
    { key: 'i', label: 'improve' },
  ],
  learn: [
    { key: '1-5', label: 'sections' },
    { key: '↕', label: 'chapters' },
  ],
};

export const StatusBar = () => {
  const { activeSection } = useSection();

  const handleReset = () => {
    if (!window.confirm('Reset hosted data?')) {
      return;
    }

    void resetHostedData().then(() => window.location.reload());
  };

  return (
    <footer className="status-bar" data-testid="status-bar">
      <span className="status-bar__section">{activeSection.name}</span>
      {(statusHints[activeSection.name] ?? []).map((hint) => (
        <span key={`${hint.key}-${hint.label}`}>
          <span className="status-bar__hint-key">{hint.key}</span>
          <span className="status-bar__hint-label"> {hint.label}</span>
        </span>
      ))}
      <span className="status-bar__spacer" />
      <span className="status-bar__model">anthropic/claude-opus-4-5</span>
      <span className="status-bar__judge">judge ministral-8b-latest</span>
      <button
        className="status-bar__reset"
        data-testid="status-reset-hosted-data"
        onClick={handleReset}
        type="button"
      >
        Reset hosted data
      </button>
    </footer>
  );
};
