import { Kicker } from '@/components/primitives';
import { artifactKindForVariant, getJsonRecord, useArtifactSource } from '../useArtifactSource';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type TraceProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
  workspaceRoot: string;
};

const statusColor: Record<BrowseCase['status'], string> = {
  fail: 'var(--tt-red)',
  partial: 'var(--tt-yellow)',
  pass: 'var(--tt-green)',
  timeout: 'var(--tt-orange)',
};

const countEntries = (value: unknown) => {
  const record = getJsonRecord(value);

  return Object.entries(record ?? {})
    .flatMap(([name, count]) =>
      typeof count === 'number' && Number.isFinite(count) ? [[name, count] as const] : [],
    )
    .sort(([, left], [, right]) => right - left);
};

const stringList = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []);

const externalCallLabels = (value: unknown) =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        const record = getJsonRecord(item);
        const system = typeof record?.system === 'string' ? record.system : undefined;
        const operation = typeof record?.operation === 'string' ? record.operation : undefined;
        const target = typeof record?.target === 'string' ? record.target : undefined;

        return system && operation ? [`${system}:${operation}${target ? ` ${target}` : ''}`] : [];
      })
    : [];

export const Trace = ({ run, testCase, variant, workspaceRoot }: TraceProps) => {
  const toolSummaryArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, variant, 'tool-summary.json'),
    runId: run.id,
    workspaceRoot,
  });
  const contextManifestArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, variant, 'context-manifest.json'),
    runId: run.id,
    workspaceRoot,
  });
  const toolSummary = getJsonRecord(toolSummaryArtifact.json);
  const contextManifest = getJsonRecord(contextManifestArtifact.json);
  const toolCalls = countEntries(toolSummary?.tool_calls_by_name);
  const skillReads = countEntries(toolSummary?.skill_reads_by_name);
  const externalCalls = externalCallLabels(toolSummary?.external_calls);
  const writtenFiles = stringList(toolSummary?.written_files);
  const editedFiles = stringList(toolSummary?.edited_files);
  const attachedSkills = Array.isArray(contextManifest?.attached_skills)
    ? contextManifest.attached_skills.flatMap((item) => {
        const record = getJsonRecord(item);
        return typeof record?.name === 'string' ? [record.name] : [];
      })
    : [];

  if (toolSummaryArtifact.source === 'hosted') {
    return (
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
  }

  return (
    <section style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <Kicker>trace / {variant}</Kicker>
      {toolSummaryArtifact.error ? (
        <p
          style={{
            border: '1px dashed var(--tt-border-active)',
            color: 'var(--tt-comment)',
            margin: 0,
            padding: 12,
          }}
        >
          {toolSummaryArtifact.error}
        </p>
      ) : (
        <>
          <article style={{ background: 'var(--tt-bg)', border: '1px solid var(--tt-border)', padding: 12 }}>
            <Kicker>tool calls</Kicker>
            {(toolCalls.length > 0 ? toolCalls : [['none', 0] as const]).map(([name, count]) => (
              <p key={name} style={{ color: 'var(--tt-fg-dark)', margin: '8px 0 0' }}>
                {name} x{count}
              </p>
            ))}
          </article>
          <article style={{ background: 'var(--tt-bg)', border: '1px solid var(--tt-border)', padding: 12 }}>
            <Kicker>skill reads</Kicker>
            <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: '8px 0 0' }}>
              {[...skillReads.map(([name, count]) => `${name} x${count}`), ...attachedSkills].join(', ') || 'none'}
            </p>
          </article>
          <article style={{ background: 'var(--tt-bg)', border: '1px solid var(--tt-border)', padding: 12 }}>
            <Kicker>external calls and files</Kicker>
            <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: '8px 0 0' }}>
              {[...externalCalls, ...writtenFiles, ...editedFiles].join(', ') || 'none'}
            </p>
          </article>
        </>
      )}
    </section>
  );
};
