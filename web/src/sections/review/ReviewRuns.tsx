import type { ReviewRun } from './useReviewData';

type ReviewRunsProps = {
  runs: ReviewRun[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
};

const formatFinishedAt = (value: string) => {
  const finishedAt = new Date(value);
  const deltaMs = Date.now() - finishedAt.getTime();

  if (Number.isNaN(deltaMs)) {
    return value;
  }

  const minutes = Math.max(1, Math.round(deltaMs / 60000));
  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }

  return `${Math.round(hours / 24)}d ago`;
};

const rateColor = (passed: number, total: number) =>
  total > 0 && passed >= total
    ? 'var(--tt-green)'
    : passed <= 0
      ? 'var(--tt-red)'
      : 'var(--tt-orange)';

export const ReviewRuns = ({ runs, selectedRunId, onSelectRun }: ReviewRunsProps) => (
  <aside
    aria-label="Review runs"
    style={{
      border: '1px solid var(--tt-border)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      width: 250,
    }}
  >
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        borderBottom: '1px solid var(--tt-border)',
        color: 'var(--tt-fg-dark)',
        fontSize: 12,
        fontWeight: 700,
        padding: '6px 12px',
      }}
    >
      runs
    </div>
    <div style={{ overflow: 'auto', padding: '6px 0' }}>
      {runs.map((run) => {
        const selected = run.id === selectedRunId;
        const passed = run.cases.filter((testCase) => testCase.status === 'pass').length;
        const total = run.cases.length;
        const ok = (run.exitCode ?? (run.status === 'fail' ? 1 : 0)) === 0;

        return (
          <div
            aria-label={`select run ${run.id}`}
            aria-pressed={selected}
            key={run.id}
            onClick={() => onSelectRun(run.id)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelectRun(run.id);
              }
            }}
            role="button"
            tabIndex={0}
            title={run.finishedAt}
            style={{
              background: selected ? 'var(--tt-selection)' : 'transparent',
              borderLeft: `2px solid ${selected ? 'var(--tt-blue)' : 'transparent'}`,
              cursor: 'pointer',
              padding: '8px 12px',
            }}
          >
            <div style={{ alignItems: 'center', display: 'flex', gap: 7 }}>
              <span
                aria-hidden="true"
                style={{
                  background: ok ? 'var(--tt-green)' : 'var(--tt-red)',
                  borderRadius: '50%',
                  height: 7,
                  width: 7,
                }}
              />
              <span
                style={{
                  color: 'var(--tt-yellow)',
                  fontSize: 13,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {run.id.slice(0, 12)}
              </span>
            </div>
            <div
              style={{
                color: 'var(--tt-comment)',
                fontSize: 11,
                marginTop: 3,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {run.skill} · {formatFinishedAt(run.finishedAt)}
            </div>
            <div style={{ display: 'flex', fontSize: 12, gap: 10, marginTop: 4 }}>
              <span style={{ color: rateColor(passed, total) }}>
                {passed}/{total}
              </span>
              {typeof run.cost === 'number' ? (
                <span style={{ color: 'var(--tt-green)' }}>${run.cost.toFixed(2)}</span>
              ) : null}
              {typeof run.exitCode === 'number' ? (
                <span style={{ color: ok ? 'var(--tt-green)' : 'var(--tt-red)' }}>
                  exit {run.exitCode}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  </aside>
);
