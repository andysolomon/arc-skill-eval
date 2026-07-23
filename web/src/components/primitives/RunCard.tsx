import { color, text } from '@/design/tokens';
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
  pass: color.green,
  fail: color.red,
  timeout: color.orange,
  running: color.cyan,
  partial: color.yellow,
};

export const RunCard = ({ runId, skillName, finishedAt, status, counts }: RunCardProps) => {
  const { theme } = useTheme();

  return (
    <article
      data-run-status={status}
      data-theme-variant={theme}
      style={{
        background: color.bgDark,
        border: `1px solid ${color.border}`,
        color: color.fg,
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
              color: color.comment,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: text.sm,
              overflowWrap: 'anywhere',
            }}
          >
            {runId}
          </div>
          <h3 style={{ fontSize: 16, lineHeight: 1.25, margin: '4px 0 0' }}>{skillName}</h3>
          <p style={{ color: color.fgDark, fontSize: text.sm, margin: '6px 0 0' }}>{finishedAt}</p>
        </div>
      </div>
      <footer
        style={{
          borderTop: `1px solid ${color.border}`,
          color: color.fgDark,
          display: 'flex',
          flexWrap: 'wrap',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: text.sm,
          gap: 'var(--tt-gap-3, 12px)',
          paddingTop: 10,
        }}
      >
        <span style={{ color: color.green }}>pass {counts.pass}</span>
        <span style={{ color: color.red }}>fail {counts.fail}</span>
        <span style={{ color: color.orange }}>timeout {counts.timeout}</span>
      </footer>
    </article>
  );
};
