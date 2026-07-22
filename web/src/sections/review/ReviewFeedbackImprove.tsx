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
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  display: 'grid',
  gap: 12,
  padding: 14,
};

export const reviewButtonStyle = {
  background: 'var(--tt-selection)',
  border: '1px solid var(--tt-border-active)',
  color: 'var(--tt-fg)',
  cursor: 'pointer',
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
    <aside aria-label="Feedback and improve" style={{ display: 'grid', gap: 12, width: 360 }}>
      <section style={reviewPanelStyle}>
        <header style={{ display: 'grid', gap: 4 }}>
          <h2 style={{ fontSize: 15, lineHeight: 1.2, margin: 0 }}>feedback.json</h2>
          <p
            style={{
              color: 'var(--tt-comment)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              margin: 0,
            }}
          >
            {selectedCaseId ?? 'run'} · {feedback.length} notes
          </p>
        </header>
        <textarea
          aria-label="feedback note"
          onChange={(event) => setNote(event.target.value)}
          placeholder="note"
          value={note}
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-fg)',
            lineHeight: 1.45,
            minHeight: 72,
            padding: 10,
            resize: 'vertical',
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
            ...reviewButtonStyle,
            cursor: trimmedNote ? 'pointer' : 'not-allowed',
            opacity: trimmedNote ? 1 : 0.6,
          }}
        >
          record feedback
        </button>
        <div style={{ display: 'grid', gap: 10 }}>
          {feedback.map((record) => (
            <article
              key={record.noteId}
              style={{
                background: 'var(--tt-bg)',
                border: '1px solid var(--tt-border)',
                borderLeft: '4px solid var(--tt-yellow)',
                display: 'grid',
                gap: 8,
                padding: 10,
              }}
            >
              <header style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                <span
                  style={{
                    color: 'var(--tt-comment)',
                    flex: '1 1 auto',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 12,
                    minWidth: 0,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {record.createdAt} · {record.caseId ?? 'run'}
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
                    border: '1px solid var(--tt-border)',
                    color: 'var(--tt-red)',
                    cursor: 'pointer',
                    lineHeight: 1,
                    padding: '2px 6px',
                  }}
                >
                  ×
                </button>
              </header>
              <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.45, margin: 0 }}>
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
