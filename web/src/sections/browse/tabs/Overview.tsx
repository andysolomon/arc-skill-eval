import { Kicker } from '@/components/primitives';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type OverviewProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
};

const statusColor: Record<BrowseCase['deltaTag'], string> = {
  FAIL: 'var(--tt-red)',
  PASS: 'var(--tt-green)',
  TIMEOUT: 'var(--tt-orange)',
};

const formatUsd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    currency: 'USD',
    maximumFractionDigits: 5,
    style: 'currency',
  }).format(value);

const formatMs = (value: number) => `${Math.round(value)}ms`;

const KpiTile = ({ label, value }: { label: string; value: string }) => (
  <div
    style={{
      background: 'var(--tt-bg)',
      border: '1px solid var(--tt-border)',
      display: 'grid',
      gap: 6,
      minWidth: 0,
      padding: 12,
    }}
  >
    <span
      style={{
        color: 'var(--tt-comment)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 11,
        textTransform: 'uppercase',
      }}
    >
      {label}
    </span>
    <strong style={{ color: 'var(--tt-fg)', fontSize: 18, lineHeight: 1.1 }}>{value}</strong>
  </div>
);

export const Overview = ({ run, testCase, variant }: OverviewProps) => (
  <div style={{ display: 'grid', gap: 14, minWidth: 0 }}>
    <header
      style={{
        background: 'var(--tt-bg)',
        border: '1px solid var(--tt-border)',
        display: 'grid',
        gap: 10,
        padding: 14,
      }}
    >
      <Kicker>grading</Kicker>
      <div style={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <strong style={{ color: statusColor[testCase.deltaTag], fontSize: 22, lineHeight: 1 }}>
          {testCase.deltaTag}
        </strong>
        <span style={{ color: 'var(--tt-comment)', fontSize: 13 }}>
          {run.skill} / {variant} / {testCase.id}
        </span>
      </div>
      <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
        {testCase.failureEvidence ?? 'Assertions passed with concrete evidence in grading.json.'}
      </p>
    </header>

    <div
      aria-label="browse overview kpis"
      style={{
        display: 'grid',
        gap: 10,
        gridTemplateColumns: 'repeat(4, minmax(116px, 1fr))',
        minWidth: 0,
      }}
    >
      <KpiTile label="tokens" value={testCase.metrics.tokens.toLocaleString()} />
      <KpiTile label="cost" value={formatUsd(testCase.metrics.costUsd)} />
      <KpiTile label="latency" value={formatMs(testCase.metrics.latencyMs)} />
      <KpiTile label="ms/case" value={formatMs(testCase.metrics.msPerCase)} />
    </div>

    <section style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <Kicker>prompt</Kicker>
      <p style={{ color: 'var(--tt-fg)', lineHeight: 1.55, margin: 0 }}>{testCase.prompt}</p>
    </section>

    <section style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <Kicker>expected</Kicker>
      <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.55, margin: 0 }}>{testCase.expected}</p>
    </section>

    {run.compare ? (
      <section style={{ display: 'grid', gap: 8, minWidth: 0 }}>
        <Kicker>compare</Kicker>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.55, margin: 0 }}>
          Benchmark delta {run.benchmarkDelta ?? 0}; switch variants above to inspect each arm.
        </p>
      </section>
    ) : null}
  </div>
);
