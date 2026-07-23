import type { BrowseRun } from './useBrowseData';

type BrowseRunsProps = {
  runs: BrowseRun[];
  selectedRunId?: string;
  onSelectRun: (runId: string) => void;
};

const statusGlyph = (run: BrowseRun) => {
  const failed = run.cases.some((testCase) => testCase.status === 'fail');
  const timeout = run.cases.some((testCase) => testCase.status === 'timeout');

  if (run.status === 'fail' || failed) {
    return { glyph: '✗', color: 'var(--tt-red)' };
  }

  if (run.status === 'timeout' || timeout) {
    return { glyph: '◐', color: 'var(--tt-orange)' };
  }

  return { glyph: '✓', color: 'var(--tt-green)' };
};

export const BrowseRuns = ({ runs, selectedRunId, onSelectRun }: BrowseRunsProps) => (
  <aside
    aria-label="Runs Rail"
    style={{
      border: '1px solid var(--tt-border)',
      borderRadius: 8,
      display: 'flex',
      flex: 'none',
      flexDirection: 'column',
      maxHeight: '40%',
      minWidth: 0,
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        borderBottom: '1px solid var(--tt-border)',
        display: 'flex',
        fontSize: 12,
        justifyContent: 'space-between',
        padding: '4px 10px',
      }}
    >
      <span style={{ color: 'var(--tt-fg-dark)' }}>Runs</span>
      <span style={{ color: 'var(--tt-dim)' }}>{runs.length}</span>
    </div>
    <div style={{ overflow: 'auto' }}>
      {runs.map((run) => {
        const selected = run.id === selectedRunId;
        const status = statusGlyph(run);
        const passed = run.cases.filter((testCase) => testCase.status === 'pass').length;

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
            title={`${run.skill} · ${run.finishedAt}`}
            style={{
              alignItems: 'center',
              background: selected ? 'var(--tt-selection)' : 'transparent',
              cursor: 'pointer',
              display: 'flex',
              gap: 6,
              height: 24,
              minWidth: 0,
              padding: '0 8px',
            }}
          >
            <span
              aria-hidden="true"
              style={{ color: selected ? 'var(--tt-blue)' : 'transparent', width: 6 }}
            >
              ▌
            </span>
            <span
              aria-hidden="true"
              style={{ color: status.color, fontWeight: 700, width: 12 }}
            >
              {status.glyph}
            </span>
            <span
              style={{
                color: selected ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                flex: 1,
                fontSize: 13,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {run.id}
            </span>
            <span style={{ color: 'var(--tt-comment)', fontSize: 11 }}>
              {run.compare ? '⇄' : `${passed}/${run.cases.length}`}
            </span>
          </div>
        );
      })}
    </div>
  </aside>
);
