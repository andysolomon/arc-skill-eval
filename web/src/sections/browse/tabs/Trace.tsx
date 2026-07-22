import { Kicker } from '@/components/primitives';
import type { BrowseCase } from '../useBrowseData';

type TraceProps = {
  testCase: BrowseCase;
};

const statusColor: Record<BrowseCase['status'], string> = {
  fail: 'var(--tt-red)',
  partial: 'var(--tt-yellow)',
  pass: 'var(--tt-green)',
  timeout: 'var(--tt-orange)',
};

export const Trace = ({ testCase }: TraceProps) => (
  <section style={{ display: 'grid', gap: 12, minWidth: 0 }}>
    <Kicker>trace</Kicker>
    <div style={{ display: 'grid', gap: 10 }}>
      {testCase.trace.map((turn, index) => (
        <article
          key={turn.id}
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            display: 'grid',
            gap: 8,
            padding: 12,
          }}
        >
          <header style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
            <span
              style={{
                color: 'var(--tt-comment)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
              }}
            >
              turn {index + 1}
            </span>
            <strong style={{ color: statusColor[turn.status], fontSize: 14 }}>{turn.label}</strong>
          </header>
          <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>{turn.summary}</p>
        </article>
      ))}
    </div>
  </section>
);
