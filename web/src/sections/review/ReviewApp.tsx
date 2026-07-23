import { useEffect, useMemo, useState } from 'react';
import { useEnv } from '@/state/env';
import { ReviewFeedbackImprove } from './ReviewFeedbackImprove';
import { ReviewImportPanel } from './ReviewImportPanel';
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

  const hasRuns = runs.length > 0 && selectedRun;

  return (
    <main
      className="app-main"
      data-testid={hasRuns ? 'review-app' : 'review-empty-state'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        minWidth: hasRuns ? 1100 : 0,
        overflow: 'hidden',
        padding: 0,
      }}
    >
      {env === 'localhost' && hasRuns ? (
        <div
          style={{
            borderBottom: '1px solid var(--tt-border)',
            flex: 'none',
            fontSize: 12,
            padding: '9px 16px',
          }}
        >
          <span style={{ color: 'var(--tt-green)', fontWeight: 700 }}>localhost</span>
          <span style={{ color: 'var(--tt-comment)' }}>
            {' '}
            reviewing runs under <span style={{ color: 'var(--tt-teal)' }}>
              ./evals-runs
            </span>{' '}
            — pick one on the left. hosted users import a JSON file to review it.
          </span>
        </div>
      ) : (
        <div style={{ flex: 'none', padding: hasRuns ? '16px 16px 0' : 16 }}>
          <ReviewImportPanel createSampleRun={createSampleReviewRun} onImport={importRuns} />
        </div>
      )}
      {hasRuns ? (
        <section
          aria-label="Review workspace"
          style={{
            display: 'flex',
            flex: 1,
            gap: 12,
            minHeight: 0,
            padding: 16,
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
        </section>
      ) : null}
    </main>
  );
};
