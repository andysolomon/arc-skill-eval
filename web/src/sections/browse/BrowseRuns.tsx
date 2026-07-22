import { Column, Kicker, RunCard, type RunSummary } from '@/components/primitives';
import type { BrowseRun } from './useBrowseData';

type BrowseRunsProps = {
  runs: BrowseRun[];
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

const countCases = (run: BrowseRun): RunSummary['counts'] => ({
  pass: run.cases.filter((testCase) => testCase.status === 'pass').length,
  fail: run.cases.filter((testCase) => testCase.status === 'fail').length,
  timeout: run.cases.filter((testCase) => testCase.status === 'timeout').length,
});

const toRunCard = (run: BrowseRun): RunSummary => {
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
    counts,
    finishedAt: formatFinishedAt(run.finishedAt),
    runId: run.id,
    skillName: run.skill,
    status,
  };
};

export const BrowseRuns = ({ runs, selectedRunId, onSelectRun }: BrowseRunsProps) => (
  <aside aria-label="Runs Rail" style={{ minWidth: 0, width: 200 }}>
    <Column gap={3} width={200}>
      <Kicker>runs rail</Kicker>
      {runs.length === 0 ? (
        <p
          style={{
            border: '1px dashed var(--tt-border-active)',
            color: 'var(--tt-comment)',
            fontSize: 13,
            lineHeight: 1.45,
            margin: 0,
            padding: 12,
          }}
        >
          no imported runs yet
        </p>
      ) : null}
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
            <span aria-hidden="true" style={{ background: selected ? 'var(--tt-cyan)' : 'transparent' }} />
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <RunCard {...toRunCard(run)} />
              {run.compare ? (
                <span
                  style={{
                    border: '1px solid var(--tt-border)',
                    color: 'var(--tt-yellow)',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 11,
                    justifySelf: 'start',
                    padding: '3px 6px',
                  }}
                >
                  delta {run.benchmarkDelta ?? 0}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </Column>
  </aside>
);
