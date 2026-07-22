import { useEffect, useMemo, useState } from 'react';
import { useEnv } from '@/state/env';
import { ReviewEmptyState } from './ReviewEmptyState';
import { ReviewFeedbackImprove } from './ReviewFeedbackImprove';
import { ReviewRuns } from './ReviewRuns';
import { ReviewSummary } from './ReviewSummary';
import { useReviewData } from './useReviewData';

export const ReviewApp = () => {
  const { env } = useEnv();
  const {
    createSampleReviewRun,
    feedbackByRun,
    importRuns,
    improvePlansByRun,
    lastRunId,
    parseReviewRuns,
    recordFeedback,
    removeFeedback,
    runs,
  } = useReviewData();
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const selectedRun = useMemo(
    () => runs.find((run) => run.id === selectedRunId),
    [runs, selectedRunId],
  );
  const [selectedCaseId, setSelectedCaseId] = useState<string | undefined>();

  useEffect(() => {
    if (runs.length === 0) {
      setSelectedRunId(undefined);
      setSelectedCaseId(undefined);
      return;
    }

    if (!selectedRunId || !runs.some((run) => run.id === selectedRunId)) {
      const preferredRun = runs.find((run) => run.id === lastRunId);
      setSelectedRunId(preferredRun?.id ?? runs[0].id);
    }
  }, [lastRunId, runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRun) {
      setSelectedCaseId(undefined);
      return;
    }

    if (!selectedCaseId || !selectedRun.cases.some((testCase) => testCase.id === selectedCaseId)) {
      const failedCase = selectedRun.cases.find((testCase) => testCase.status === 'fail');
      setSelectedCaseId(failedCase?.id ?? selectedRun.cases[0]?.id);
    }
  }, [selectedCaseId, selectedRun]);

  if (runs.length === 0) {
    return (
      <ReviewEmptyState
        createSampleRun={createSampleReviewRun}
        onImport={importRuns}
        parseImport={parseReviewRuns}
      />
    );
  }

  if (!selectedRun) {
    return null;
  }

  return (
    <main className="app-main" data-testid="review-app" style={{ minWidth: 0, overflow: 'auto', padding: 16 }}>
      <section aria-label="Review workspace" style={{ display: 'grid', gap: 14, minWidth: 920 }}>
        {env === 'localhost' ? (
          <div
            style={{
              border: '1px solid var(--tt-border)',
              color: 'var(--tt-comment)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              padding: '7px 10px',
            }}
          >
            localhost reading ~/.../evals-runs from disk.
          </div>
        ) : null}
        <div
          style={{
            alignItems: 'start',
            display: 'grid',
            gap: 14,
            gridTemplateColumns: '250px minmax(0, 1fr) 360px',
          }}
        >
          <ReviewRuns runs={runs} selectedRunId={selectedRun.id} onSelectRun={setSelectedRunId} />
          <ReviewSummary
            run={selectedRun}
            selectedCaseId={selectedCaseId}
            onSelectCase={setSelectedCaseId}
          />
          <ReviewFeedbackImprove
            activeRunId={selectedRun.id}
            env={env}
            feedback={feedbackByRun.get(selectedRun.id) ?? []}
            improvePlans={improvePlansByRun.get(selectedRun.id) ?? []}
            onRecordFeedback={recordFeedback}
            onRemoveFeedback={removeFeedback}
            run={selectedRun}
            selectedCaseId={selectedCaseId}
          />
        </div>
      </section>
    </main>
  );
};
