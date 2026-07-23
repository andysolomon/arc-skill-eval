import { useState } from 'react';
import type { FeedbackRecord } from '@/persistence/feedback';
import type { ImprovePlanRecord } from '@/persistence/improvePlans';
import type { EnvName } from '@/persistence/preferences';
import { ReviewFeedbackImproveHosted } from './ReviewFeedbackImprove.hosted';
import { ReviewFeedbackImproveLocalhost } from './ReviewFeedbackImprove.localhost';
import type { ReviewRun } from './useReviewData';

type ReviewFeedbackImproveProps = {
  activeRunId: string;
  env: EnvName;
  run: ReviewRun;
  selectedCaseId?: string;
  feedback: FeedbackRecord[];
  improvePlans: ImprovePlanRecord[];
  onRecordFeedback: (runId: string, caseId: string | undefined, note: string) => Promise<void>;
  onRemoveFeedback: (noteId: string) => Promise<void>;
};

export type ReviewImproveVariantProps = {
  activeRunId: string;
  feedbackCount: number;
  improvePlans: ImprovePlanRecord[];
  run: ReviewRun;
};

export const reviewPanelStyle = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  color: 'var(--tt-fg)',
  display: 'grid',
  gap: 10,
  padding: 12,
};

export const reviewButtonStyle = {
  background: 'transparent',
  border: '1px solid var(--tt-magenta)',
  borderRadius: 6,
  color: 'var(--tt-magenta)',
  cursor: 'pointer',
  fontSize: 13,
  minHeight: 34,
  padding: '8px 10px',
};

export const ReviewFeedbackImprove = ({
  activeRunId,
  env,
  run,
  selectedCaseId,
  feedback,
  improvePlans,
  onRecordFeedback,
  onRemoveFeedback,
}: ReviewFeedbackImproveProps) => {
  const [note, setNote] = useState('');
  const trimmedNote = note.trim();

  const handleRecord = async () => {
    if (!trimmedNote) {
      return;
    }

    await onRecordFeedback(run.id, selectedCaseId, trimmedNote);
    setNote('');
  };

  return (
    <aside
      aria-label="Feedback and improve"
      style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 360 }}
    >
      <section
        style={{
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <header
          style={{
            background: 'var(--tt-bg-dark)',
            borderBottom: '1px solid var(--tt-border)',
            fontSize: 12,
            padding: '6px 12px',
          }}
        >
          <h2
            style={{
              color: 'var(--tt-fg-dark)',
              display: 'inline',
              fontSize: 12,
              fontWeight: 700,
              margin: 0,
            }}
          >
            feedback.json
          </h2>
          <span style={{ color: 'var(--tt-comment)' }}>
            {' '}
            — {selectedCaseId ?? 'run'} · {feedback.length} notes
          </span>
        </header>
        <div style={{ padding: 12 }}>
          <textarea
            aria-label="feedback note"
            onChange={(event) => setNote(event.target.value)}
            placeholder="note what to change: prompt, assertion, fixture, adjacent-negative…"
            value={note}
            style={{
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-fg)',
              fontSize: 13,
              height: 88,
              lineHeight: 1.45,
              outline: 'none',
              padding: 9,
              resize: 'none',
              width: '100%',
            }}
          />
          <button
            disabled={!trimmedNote}
            onClick={() => {
              void handleRecord();
            }}
            type="button"
            style={{
              alignItems: 'center',
              background: 'transparent',
              border: '1px solid var(--tt-border)',
              borderRadius: 6,
              color: 'var(--tt-yellow)',
              cursor: trimmedNote ? 'pointer' : 'not-allowed',
              display: 'flex',
              fontSize: 13,
              height: 34,
              justifyContent: 'center',
              marginTop: 8,
              opacity: trimmedNote ? 1 : 0.6,
              width: '100%',
            }}
          >
            record feedback
          </button>
          {feedback.map((record) => (
            <article
              key={record.noteId}
              style={{
                background: 'var(--tt-bg-dark)',
                borderLeft: '2px solid var(--tt-yellow)',
                borderRadius: 6,
                marginTop: 8,
                padding: '8px 10px',
              }}
            >
              <header style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <span
                  style={{
                    color: 'var(--tt-comment)',
                    flex: '1 1 auto',
                    fontSize: 11,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {record.caseId ?? 'run'} · {record.createdAt}
                </span>
                <button
                  aria-label={`remove feedback ${record.noteId}`}
                  onClick={() => {
                    if (window.confirm('Remove this feedback note?')) {
                      void onRemoveFeedback(record.noteId);
                    }
                  }}
                  type="button"
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: 'var(--tt-comment)',
                    cursor: 'pointer',
                    fontSize: 15,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </header>
              <p
                style={{
                  color: 'var(--tt-fg-dark)',
                  fontSize: 12.5,
                  lineHeight: 1.45,
                  margin: '4px 0 0',
                }}
              >
                {record.note}
              </p>
            </article>
          ))}
        </div>
      </section>
      {env === 'localhost' ? (
        <ReviewFeedbackImproveLocalhost
          activeRunId={activeRunId}
          feedbackCount={feedback.length}
          improvePlans={improvePlans}
          run={run}
        />
      ) : (
        <ReviewFeedbackImproveHosted
          activeRunId={activeRunId}
          feedbackCount={feedback.length}
          improvePlans={improvePlans}
          run={run}
        />
      )}
    </aside>
  );
};
