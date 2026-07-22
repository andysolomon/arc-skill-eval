import { CaseCard, type CaseDeltaTag } from '@/components/primitives';
import type { ReviewCase, ReviewRun } from './useReviewData';

type ReviewSummaryProps = {
  run: ReviewRun;
  selectedCaseId?: string;
  onSelectCase: (caseId: string) => void;
};

const toDeltaTag = (status: ReviewCase['status']): CaseDeltaTag => {
  if (status === 'fail') {
    return 'FAIL';
  }

  if (status === 'timeout') {
    return 'TIMEOUT';
  }

  return 'PASS';
};

const failureEvidence = (testCase: ReviewCase) => {
  if (testCase.status === 'pass') {
    return testCase.output ?? 'pass';
  }

  return [testCase.output, testCase.failureEvidence].filter(Boolean).join('\n\n');
};

export const ReviewSummary = ({ run, selectedCaseId, onSelectCase }: ReviewSummaryProps) => {
  const passCount = run.cases.filter((testCase) => testCase.status === 'pass').length;
  const failCount = run.cases.filter((testCase) => testCase.status === 'fail').length;

  return (
    <section aria-labelledby="review-summary-title" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <header
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-fg)',
          display: 'grid',
          gap: 6,
          padding: 14,
        }}
      >
        <p
          style={{
            color: 'var(--tt-cyan)',
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            fontSize: 12,
            margin: 0,
          }}
        >
          review.html
        </p>
        <h1 id="review-summary-title" style={{ fontSize: 22, lineHeight: 1.15, margin: 0 }}>
          passed {passCount} / {run.cases.length} · failed {failCount}
        </h1>
      </header>
      <div style={{ display: 'grid', gap: 12, minWidth: 0 }}>
        {run.cases.map((testCase) => {
          const selected = testCase.id === selectedCaseId;
          const failed = testCase.status === 'fail';

          return (
            <div
              aria-label={`select case ${testCase.id}`}
              aria-pressed={selected}
              key={testCase.id}
              onClick={() => onSelectCase(testCase.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelectCase(testCase.id);
                }
              }}
              role="button"
              tabIndex={0}
              style={{
                border:
                  selected && failed
                    ? '1px solid var(--tt-red)'
                    : selected
                      ? '1px solid var(--tt-border-active)'
                      : '1px solid transparent',
                cursor: 'pointer',
                display: 'grid',
                gridTemplateColumns: selected ? '4px minmax(0, 1fr)' : '0 minmax(0, 1fr)',
                minWidth: 0,
              }}
            >
              <span
                aria-hidden="true"
                style={{ background: selected ? failed ? 'var(--tt-red)' : 'var(--tt-yellow)' : 'transparent' }}
              />
              <CaseCard
                caseId={testCase.id}
                deltaTag={toDeltaTag(testCase.status)}
                failureEvidenceBlock={failureEvidence(testCase)}
                promptExcerpt={testCase.prompt}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
};
