import { Kicker } from '@/components/primitives';
import { artifactKindForVariant, getJsonRecord, useArtifactSource } from '../useArtifactSource';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type OverviewProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
  workspaceRoot: string;
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

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readTimingMetrics = (timingJson: unknown, fallback: BrowseCase['metrics']) => {
  const timing = getJsonRecord(timingJson);
  const tokenUsage = getJsonRecord(timing?.token_usage);

  return {
    costUsd: asNumber(timing?.estimated_cost_usd) ?? fallback.costUsd,
    latencyMs: asNumber(timing?.duration_ms) ?? fallback.latencyMs,
    msPerCase: fallback.msPerCase,
    tokens: asNumber(timing?.total_tokens) ?? asNumber(tokenUsage?.total_tokens) ?? fallback.tokens,
  };
};

const readGradingSummary = (gradingJson: unknown, fallback: BrowseCase['deltaTag']) => {
  const grading = getJsonRecord(gradingJson);
  const summary = getJsonRecord(grading?.summary);
  const failed = asNumber(summary?.failed);

  if (failed === undefined) {
    return fallback;
  }

  return failed > 0 ? 'FAIL' : 'PASS';
};

const readGradingEvidence = (gradingJson: unknown, fallback: string) => {
  const grading = getJsonRecord(gradingJson);
  const assertionResults = Array.isArray(grading?.assertion_results)
    ? grading.assertion_results
    : [];
  const failedResult = assertionResults
    .map(getJsonRecord)
    .find((result) => result?.passed === false);
  const firstResult = getJsonRecord(assertionResults[0]);
  const evidence = failedResult?.evidence ?? firstResult?.evidence;

  return typeof evidence === 'string' && evidence.length > 0 ? evidence : fallback;
};

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

export const Overview = ({ run, testCase, variant, workspaceRoot }: OverviewProps) => {
  const gradingArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, variant, 'grading.json'),
    runId: run.id,
    workspaceRoot,
  });
  const timingArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, variant, 'timing.json'),
    runId: run.id,
    workspaceRoot,
  });
  const fallbackEvidence =
    testCase.failureEvidence ?? 'Assertions passed with concrete evidence in grading.json.';
  const deltaTag =
    gradingArtifact.source === 'hosted'
      ? testCase.deltaTag
      : readGradingSummary(gradingArtifact.json, testCase.deltaTag);
  const metrics =
    timingArtifact.source === 'hosted'
      ? testCase.metrics
      : readTimingMetrics(timingArtifact.json, testCase.metrics);
  const gradingEvidence =
    gradingArtifact.source === 'hosted'
      ? fallbackEvidence
      : readGradingEvidence(gradingArtifact.json, fallbackEvidence);

  return (
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
          <strong style={{ color: statusColor[deltaTag], fontSize: 22, lineHeight: 1 }}>
            {deltaTag}
          </strong>
          <span style={{ color: 'var(--tt-comment)', fontSize: 13 }}>
            {run.skill} / {variant} / {testCase.id}
          </span>
        </div>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          {gradingArtifact.error ?? gradingEvidence}
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
        <KpiTile label="tokens" value={metrics.tokens.toLocaleString()} />
        <KpiTile label="cost" value={formatUsd(metrics.costUsd)} />
        <KpiTile label="latency" value={formatMs(metrics.latencyMs)} />
        <KpiTile label="ms/case" value={formatMs(metrics.msPerCase)} />
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
};
