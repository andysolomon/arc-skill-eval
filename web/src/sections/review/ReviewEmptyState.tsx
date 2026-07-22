import { useState } from 'react';
import { ImportCard } from '@/components/primitives';
import type { ReviewRun } from './useReviewData';

type ReviewEmptyStateProps = {
  createSampleRun: () => ReviewRun;
  onImport: (runs: ReviewRun[]) => Promise<void>;
  parseImport: (text: string) => ReviewRun[];
};

const chipStyle = {
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-comment)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 12,
  padding: '4px 7px',
};

export const ReviewEmptyState = ({
  createSampleRun,
  onImport,
  parseImport,
}: ReviewEmptyStateProps) => {
  const [message, setMessage] = useState<string | null>(null);

  const handleImport = async (runs: ReviewRun[]) => {
    await onImport(runs);
    setMessage(null);
  };

  return (
    <main
      className="app-main"
      data-testid="review-empty-state"
      style={{ alignItems: 'center', display: 'grid', justifyItems: 'center', padding: 16 }}
    >
      <div style={{ display: 'grid', gap: 12, justifyItems: 'center', width: 'min(100%, 620px)' }}>
        <div
          aria-label="accepted import files"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}
        >
          {['evals.json', 'benchmark.json', 'grading.json', 'evals-runs bundle'].map((label) => (
            <span key={label} style={chipStyle}>
              {label}
            </span>
          ))}
        </div>
        <ImportCard
          onSample={() => {
            void handleImport([createSampleRun()]);
          }}
          onValidate={(text) => {
            try {
              void handleImport(parseImport(text));
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Import could not be parsed.');
            }
          }}
        />
        {message ? (
          <p
            role="alert"
            style={{ color: 'var(--tt-red)', lineHeight: 1.45, margin: 0, textAlign: 'center' }}
          >
            {message}
          </p>
        ) : null}
      </div>
    </main>
  );
};
