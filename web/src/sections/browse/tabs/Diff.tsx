import { Kicker } from '@/components/primitives';
import { artifactKindForVariant, useArtifactSource } from '../useArtifactSource';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type DiffProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
  workspaceRoot: string;
};

const diffRows = (expected: string, response: string) => [
  { sign: '-', text: expected, tone: 'var(--tt-red)' },
  { sign: '+', text: response, tone: 'var(--tt-green)' },
];

const rowsForArm = (
  expected: string,
  response: string,
  arm: BrowseVariant,
  hostedSource: boolean,
) =>
  arm === 'with_skill'
    ? diffRows(expected, response)
    : [
        { sign: '-', text: expected, tone: 'var(--tt-red)' },
        {
          sign: ' ',
          text: hostedSource
            ? 'without_skill assistant.md is not included in the hosted import shape yet.'
            : response,
          tone: 'var(--tt-comment)',
        },
      ];

export const Diff = ({ run, testCase, variant, workspaceRoot }: DiffProps) => {
  const withSkillArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, 'with_skill', 'assistant.md'),
    runId: run.id,
    workspaceRoot,
  });
  const withoutSkillArtifact = useArtifactSource({
    caseId: testCase.id,
    kind: artifactKindForVariant(run.compare, 'without_skill', 'assistant.md'),
    runId: run.id,
    workspaceRoot,
  });
  const responseByArm: Record<BrowseVariant, string> = {
    with_skill: withSkillArtifact.error ?? (withSkillArtifact.text || testCase.response),
    without_skill: withoutSkillArtifact.error ?? (withoutSkillArtifact.text || testCase.response),
  };

  if (!run.compare) {
    return (
      <section style={{ display: 'grid', gap: 10, minWidth: 0 }}>
        <Kicker>diff</Kicker>
        <p
          style={{
            border: '1px dashed var(--tt-border-active)',
            color: 'var(--tt-comment)',
            lineHeight: 1.5,
            margin: 0,
            padding: 12,
          }}
        >
          This imported run was not captured with compare mode, so browse has no with_skill
          versus without_skill pair to diff.
        </p>
      </section>
    );
  }

  return (
    <section style={{ display: 'grid', gap: 12, minWidth: 0 }}>
      <Kicker>diff / {variant}</Kicker>
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
        {(['without_skill', 'with_skill'] as const).map((arm) => (
          <div
            aria-label={`${arm} response diff`}
            key={arm}
            style={{
              background: 'var(--tt-bg)',
              border: arm === variant ? '1px solid var(--tt-border-active)' : '1px solid var(--tt-border)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.5,
              maxHeight: 520,
              overflow: 'auto',
              padding: 12,
            }}
          >
            {rowsForArm(
              testCase.expected,
              responseByArm[arm],
              arm,
              withoutSkillArtifact.source === 'hosted',
            ).map((row, index) => (
              <div
                key={`${row.sign}-${index}`}
                style={{
                  color: row.tone,
                  display: 'grid',
                  gap: 8,
                  gridTemplateColumns: '16px minmax(0, 1fr)',
                  whiteSpace: 'pre-wrap',
                }}
              >
                <span>{row.sign}</span>
                <span>{row.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
};
