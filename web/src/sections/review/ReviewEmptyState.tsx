import { useState } from 'react';
import { ImportCard } from '@/components/primitives';
import type { ReviewRun } from './useReviewData';

type ReviewEmptyStateProps = {
  createSampleRun: () => ReviewRun;
  onImport: (runs: ReviewRun[]) => Promise<void>;
  parseImport: (text: string) => ReviewRun[];
};

const chipStyle = (accent: boolean) => ({
  border: '1px solid var(--tt-border)',
  borderRadius: 5,
  color: accent ? 'var(--tt-cyan)' : 'var(--tt-fg-dark)',
  fontSize: 11,
  padding: '3px 8px',
});

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
      style={{ minWidth: 0, overflow: 'auto', padding: 16 }}
    >
      <div
        style={{
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          padding: '14px 16px',
        }}
      >
        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 9,
            marginBottom: 9,
          }}
        >
          <span
            data-testid="review-empty-state-kicker"
            style={{
              color: 'var(--tt-cyan)',
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            review imports — review a JSON artifact
          </span>
          <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
            hosted has no LLM, so no runs — bring a file arc-skill-eval produced and inspect it
            here.
          </span>
        </div>
        <div
          aria-label="accepted import files"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}
        >
          {['evals.json', 'grading.json', 'benchmark.json', 'timing.json', 'feedback.json'].map(
            (label, index) => (
              <span key={label} style={chipStyle(index === 0)}>
                {label}
              </span>
            ),
          )}
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
            style={{ color: 'var(--tt-red)', fontSize: 12.5, lineHeight: 1.45, margin: '10px 0 0' }}
          >
            ✗ {message}
          </p>
        ) : null}
      </div>
    </main>
  );
};
