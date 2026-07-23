import { asciiBar } from '@/sections/run/useSpinner';
import type { ReviewCase, ReviewRun } from './useReviewData';

type ReviewSummaryProps = {
  run: ReviewRun;
  selectedCaseId?: string;
  onSelectCase: (caseId: string) => void;
};

const statusGlyph = (status: ReviewCase['status']) =>
  status === 'pass' ? '✓' : status === 'fail' ? '✗' : status === 'partial' ? '◐' : '◌';

const statusColor = (status: ReviewCase['status']) =>
  status === 'pass'
    ? 'var(--tt-green)'
    : status === 'fail'
      ? 'var(--tt-red)'
      : status === 'partial'
        ? 'var(--tt-orange)'
        : 'var(--tt-comment)';

const rateColor = (passed: number, total: number) =>
  total > 0 && passed >= total
    ? 'var(--tt-green)'
    : passed <= 0
      ? 'var(--tt-red)'
      : 'var(--tt-orange)';

const compareCounts = (testCase: ReviewCase) => {
  const withTotal =
    testCase.withTotal ?? (testCase.status === 'partial' ? 2 : 1);
  const withPassed =
    testCase.withPassed ??
    (testCase.status === 'pass' ? withTotal : testCase.status === 'partial' ? 1 : 0);

  return {
    withPassed,
    withTotal,
    withoutPassed: testCase.withoutPassed,
    withoutTotal: testCase.withoutTotal,
  };
};

const deltaText = (testCase: ReviewCase) => {
  if (testCase.delta) {
    return testCase.delta;
  }

  const { withPassed, withTotal, withoutPassed, withoutTotal } = compareCounts(testCase);

  if (
    typeof withoutPassed !== 'number' ||
    typeof withoutTotal !== 'number' ||
    withTotal === 0 ||
    withoutTotal === 0
  ) {
    return 'n/a';
  }

  const delta = (withPassed / withTotal - withoutPassed / withoutTotal) * 100;
  return `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}%`;
};

const deltaColor = (delta: string) =>
  delta === 'n/a' || delta === '+0.0%'
    ? 'var(--tt-comment)'
    : delta.startsWith('-')
      ? 'var(--tt-red)'
      : 'var(--tt-green)';

const CompareRow = ({
  color,
  label,
  passed,
  total,
}: {
  color: string;
  label: string;
  passed?: number;
  total?: number;
}) => {
  const known = typeof passed === 'number' && typeof total === 'number';
  const bar = asciiBar(known ? passed : 0, known ? total : 1, 12);

  return (
    <div>
      <span style={{ color: 'var(--tt-comment)', display: 'inline-block', width: '14ch' }}>
        {label}
      </span>
      <span style={{ color }}>{bar.fill}</span>
      <span style={{ color: 'var(--tt-dim)' }}>{bar.rest}</span>
      <span style={{ color: known ? color : 'var(--tt-comment)' }}>
        {' '}
        {known ? `${passed}/${total}` : 'n/a'}
      </span>
    </div>
  );
};

export const ReviewSummary = ({ run, selectedCaseId, onSelectCase }: ReviewSummaryProps) => {
  const passCount = run.cases.filter((testCase) => testCase.status === 'pass').length;

  return (
    <section
      aria-labelledby="review-summary-title"
      style={{
        border: '1px solid var(--tt-border)',
        borderRadius: 8,
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          alignItems: 'center',
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          fontSize: 12,
          gap: 12,
          padding: '7px 16px',
        }}
      >
        <h1
          id="review-summary-title"
          style={{
            color: 'var(--tt-fg-dark)',
            fontSize: 12,
            fontWeight: 700,
            margin: 0,
          }}
        >
          review.html
        </h1>
        <span style={{ color: 'var(--tt-comment)' }}>{run.skill}</span>
        <span style={{ flex: 1 }} />
        <span style={{ color: rateColor(passCount, run.cases.length) }}>
          {passCount}/{run.cases.length} passed
        </span>
      </header>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 18px' }}>
        {run.cases.map((testCase) => {
          const selected = testCase.id === selectedCaseId;
          const failed = testCase.status === 'fail';
          const delta = deltaText(testCase);
          const counts = compareCounts(testCase);

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
                background: selected ? 'var(--tt-bg-hi)' : 'transparent',
                border: `1px solid ${selected ? 'var(--tt-border-active)' : 'var(--tt-border)'}`,
                borderRadius: 7,
                cursor: 'pointer',
                marginBottom: 10,
                minWidth: 0,
                padding: '11px 13px',
              }}
            >
              <div
                style={{ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 6 }}
              >
                <span
                  aria-hidden="true"
                  style={{ color: statusColor(testCase.status), fontWeight: 700 }}
                >
                  {statusGlyph(testCase.status)}
                </span>
                <span style={{ color: 'var(--tt-fg)', fontSize: 13, fontWeight: 700 }}>
                  {testCase.id}
                </span>
                <span style={{ flex: 1 }} />
                <span style={{ color: deltaColor(delta), fontSize: 12, fontWeight: 700 }}>
                  Δ {delta}
                </span>
              </div>
              <div style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5, marginBottom: 8 }}>
                {testCase.prompt}
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.8 }}>
                <CompareRow
                  color="var(--tt-green)"
                  label="with_skill"
                  passed={counts.withPassed}
                  total={counts.withTotal}
                />
                <CompareRow
                  color="var(--tt-orange)"
                  label="without_skill"
                  passed={counts.withoutPassed}
                  total={counts.withoutTotal}
                />
              </div>
              {failed && (testCase.failureEvidence || testCase.output) ? (
                <div style={{ color: 'var(--tt-red)', fontSize: 12, marginTop: 8 }}>
                  ✗ {testCase.failureEvidence ?? testCase.output}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
};
