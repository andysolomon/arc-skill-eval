import { useTheme } from '@/state/theme';

type RunStatus = 'pass' | 'fail' | 'timeout' | 'running' | 'partial';

export type RunSummary = {
  runId: string;
  skillName: string;
  finishedAt: string;
  status: RunStatus;
  counts: {
    pass: number;
    fail: number;
    timeout: number;
  };
};

export type RunCardProps = RunSummary;

const statusColors: Record<RunStatus, string> = {
  pass: 'var(--tt-green)',
  fail: 'var(--tt-red)',
  timeout: 'var(--tt-orange)',
  running: 'var(--tt-cyan)',
  partial: 'var(--tt-yellow)',
};

export const RunCard = ({ runId, skillName, finishedAt, status, counts }: RunCardProps) => {
  const { theme } = useTheme();

  return (
    <article
      data-run-status={status}
      data-theme-variant={theme}
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        display: 'grid',
        gap: 'var(--tt-gap-3, 12px)',
        padding: 14,
      }}
    >
      <div style={{ alignItems: 'start', display: 'flex', gap: 'var(--tt-gap-3, 12px)' }}>
        <span
          aria-label={status}
          style={{
            background: statusColors[status],
            display: 'inline-block',
            flex: '0 0 auto',
            height: 10,
            marginTop: 4,
            width: 10,
          }}
        />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              color: 'var(--tt-comment)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              overflowWrap: 'anywhere',
            }}
          >
            {runId}
          </div>
          <h3 style={{ fontSize: 16, lineHeight: 1.25, margin: '4px 0 0' }}>{skillName}</h3>
          <p style={{ color: 'var(--tt-fg-dark)', fontSize: 12, margin: '6px 0 0' }}>{finishedAt}</p>
        </div>
      </div>
      <footer
        style={{
          borderTop: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
          display: 'flex',
          flexWrap: 'wrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          gap: 'var(--tt-gap-3, 12px)',
          paddingTop: 10,
        }}
      >
        <span style={{ color: 'var(--tt-green)' }}>pass {counts.pass}</span>
        <span style={{ color: 'var(--tt-red)' }}>fail {counts.fail}</span>
        <span style={{ color: 'var(--tt-orange)' }}>timeout {counts.timeout}</span>
      </footer>
    </article>
  );
};
