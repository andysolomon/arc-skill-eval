import { Kicker } from '@/components/primitives';
import type { BrowseCase, BrowseRun, BrowseVariant } from '../useBrowseData';

type DiffProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  variant: BrowseVariant;
};

const diffRows = (testCase: BrowseCase) => [
  { sign: '-', text: testCase.expected, tone: 'var(--tt-red)' },
  { sign: '+', text: testCase.response, tone: 'var(--tt-green)' },
];

const rowsForArm = (testCase: BrowseCase, arm: BrowseVariant) =>
  arm === 'with_skill'
    ? diffRows(testCase)
    : [
        { sign: '-', text: testCase.expected, tone: 'var(--tt-red)' },
        {
          sign: ' ',
          text: 'without_skill assistant.md is not included in the hosted import shape yet.',
          tone: 'var(--tt-comment)',
        },
      ];

export const Diff = ({ run, testCase, variant }: DiffProps) => {
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
            {rowsForArm(testCase, arm).map((row, index) => (
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
