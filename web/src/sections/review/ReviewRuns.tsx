import { RunCard, type RunSummary } from '@/components/primitives';
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
    return `${minutes}m`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h`;
  }

  return `${Math.round(hours / 24)}d`;
};

const countCases = (run: ReviewRun): RunSummary['counts'] => ({
  pass: run.cases.filter((testCase) => testCase.status === 'pass').length,
  fail: run.cases.filter((testCase) => testCase.status === 'fail').length,
  timeout: run.cases.filter((testCase) => testCase.status === 'timeout').length,
});

const toRunCard = (run: ReviewRun): RunSummary => {
  const counts = countCases(run);
  const status =
    run.status === 'fail' || counts.fail > 0
      ? 'fail'
      : run.status === 'timeout' || counts.timeout > 0
        ? 'timeout'
        : run.status === 'partial'
          ? 'partial'
          : 'pass';

  return {
    runId: run.id.slice(0, 6),
    skillName: run.skill,
    finishedAt: formatFinishedAt(run.finishedAt),
    status,
    counts,
  };
};

export const ReviewRuns = ({ runs, selectedRunId, onSelectRun }: ReviewRunsProps) => (
  <aside
    aria-label="Review runs"
    style={{ display: 'grid', gap: 12, width: 250 }}
  >
    {runs.map((run) => {
      const selected = run.id === selectedRunId;

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
            border: selected ? '1px solid var(--tt-border-active)' : '1px solid transparent',
            cursor: 'pointer',
            display: 'grid',
            gridTemplateColumns: selected ? '4px minmax(0, 1fr)' : '0 minmax(0, 1fr)',
            minWidth: 0,
          }}
        >
          <span
            aria-hidden="true"
            style={{ background: selected ? 'var(--tt-yellow)' : 'transparent' }}
          />
          <RunCard {...toRunCard(run)} />
        </div>
      );
    })}
  </aside>
);
