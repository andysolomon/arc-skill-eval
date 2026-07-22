import { Kicker } from '@/components/primitives';
import { artifactKindForVariant, useArtifactSource } from '../useArtifactSource';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type ResponseProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
  workspaceRoot: string;
};

const renderLine = (line: string, index: number) => {
  if (line.startsWith('### ')) {
    return <h4 key={index} style={{ fontSize: 15, margin: '10px 0 4px' }}>{line.slice(4)}</h4>;
  }

  if (line.startsWith('## ')) {
    return <h3 key={index} style={{ fontSize: 17, margin: '12px 0 6px' }}>{line.slice(3)}</h3>;
  }

  if (line.startsWith('# ')) {
    return <h2 key={index} style={{ fontSize: 19, margin: '12px 0 6px' }}>{line.slice(2)}</h2>;
  }

  if (line.startsWith('- ')) {
    return <p key={index} style={{ margin: '4px 0 4px 14px' }}>{line}</p>;
  }

  return <p key={index} style={{ margin: line ? '0 0 8px' : '8px 0' }}>{line || ' '}</p>;
};

export const Response = ({ run, testCase, variant, workspaceRoot }: ResponseProps) => {
  const assistantArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, variant, 'assistant.md'),
    runId: run.id,
    workspaceRoot,
  });
  const responseText = assistantArtifact.text || testCase.response;

  return (
    <section style={{ display: 'grid', gap: 10, minWidth: 0 }}>
      <Kicker>assistant.md / {variant}</Kicker>
      {responseText.trim().length > 0 && !assistantArtifact.error ? (
        <article
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-fg)',
            lineHeight: 1.6,
            maxHeight: 520,
            overflow: 'auto',
            padding: 14,
          }}
        >
          {responseText.split('\n').map(renderLine)}
        </article>
      ) : (
        <p
          style={{
            border: '1px dashed var(--tt-border-active)',
            color: 'var(--tt-comment)',
            margin: 0,
            padding: 12,
          }}
        >
          {assistantArtifact.error ?? 'assistant.md is empty for this variant.'}
        </p>
      )}
    </section>
  );
};
