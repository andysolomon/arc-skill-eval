import { Kicker } from '@/components/primitives';
import { artifactKindForVariant, useArtifactSource } from '../useArtifactSource';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type RawProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
  workspaceRoot: string;
};

export const Raw = ({ run, testCase, variant, workspaceRoot }: RawProps) => {
  const rawArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, variant, 'grading.json'),
    runId: run.id,
    workspaceRoot,
  });
  const fallbackText = JSON.stringify(
    {
      case: testCase.raw,
      run: {
        benchmarkDelta: run.benchmarkDelta ?? null,
        compare: run.compare,
        id: run.id,
        skill: run.skill,
      },
      variant,
    },
    null,
    2,
  );
  const rawText =
    rawArtifact.source === 'hosted'
      ? fallbackText
      : rawArtifact.error ?? (rawArtifact.text || fallbackText);

  return (
    <section style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <Kicker>raw json / grading.json</Kicker>
      <pre
        aria-label="raw artifact json"
        style={{
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-fg)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.5,
          margin: 0,
          maxHeight: 560,
          overflow: 'auto',
          padding: 14,
          whiteSpace: 'pre-wrap',
        }}
      >
        {rawText}
      </pre>
    </section>
  );
};
