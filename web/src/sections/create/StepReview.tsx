import { useMemo, useState } from 'react';
import { Column, Kicker } from '@/components/primitives';
import type { CreateDraft, EvalsJsonDraft } from './useDraft';

type StepReviewProps = {
  assertionCount: number;
  draft: CreateDraft;
  evalsJson: EvalsJsonDraft;
};

const downloadEvalsJson = (evalsJson: EvalsJsonDraft) => {
  const blob = new Blob([`${JSON.stringify(evalsJson, null, 2)}\n`], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'evals.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

export const StepReview = ({ assertionCount, draft, evalsJson }: StepReviewProps) => {
  const [downloaded, setDownloaded] = useState(false);
  const deterministicCount = draft.assertions.filter(
    (assertion) => assertion.body.trim() && assertion.kind === 'script',
  ).length;
  const judgeCount = draft.assertions.filter(
    (assertion) => assertion.body.trim() && assertion.kind === 'judge',
  ).length;
  const canWrite = evalsJson.evals.length > 0 && assertionCount > 0;
  const command = useMemo(
    () => `$ arc-skill-eval run --compare --skill ${draft.skillPath || '<dir>'}`,
    [draft.skillPath],
  );

  return (
    <Column gap={4}>
      <Kicker>step 04</Kicker>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>review</h1>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          Check the suite summary before downloading the hosted evals.json artifact.
        </p>
      </div>

      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {[
          ['cases', evalsJson.evals.length],
          ['assertions', assertionCount],
          ['deterministic', deterministicCount],
          ['judge', judgeCount],
        ].map(([label, value]) => (
          <section
            aria-label={`${label} count`}
            key={label}
            style={{
              border: '1px solid var(--tt-border)',
              display: 'grid',
              gap: 6,
              minHeight: 74,
              padding: 10,
            }}
          >
            <span
              style={{
                color: 'var(--tt-comment)',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 12,
                textTransform: 'uppercase',
              }}
            >
              {label}
            </span>
            <strong style={{ color: 'var(--tt-fg)', fontSize: 22, lineHeight: 1 }}>
              {value}
            </strong>
          </section>
        ))}
      </div>

      <section
        aria-label="hosted write note"
        data-env="hosted"
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-cyan)',
          borderLeft: '4px solid var(--tt-cyan)',
          display: 'grid',
          gap: 10,
          padding: 12,
        }}
      >
        <p style={{ color: 'var(--tt-fg)', margin: 0 }}>
          You're on hosted - generate-evals lives in the localhost daemon.
        </p>
        <button
          aria-disabled="true"
          disabled
          type="button"
          style={{
            background: 'var(--tt-selection)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-comment)',
            cursor: 'not-allowed',
            justifySelf: 'start',
            padding: '8px 10px',
          }}
        >
          local write unavailable
        </button>
      </section>

      <pre
        aria-label="run command"
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-green)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          margin: 0,
          overflow: 'auto',
          padding: 12,
          whiteSpace: 'pre-wrap',
        }}
      >
        {command}
      </pre>

      <button
        data-testid="write-evals-json"
        disabled={!canWrite}
        onClick={() => {
          downloadEvalsJson(evalsJson);
          setDownloaded(true);
        }}
        type="button"
        style={{
          background: canWrite ? 'var(--tt-cyan)' : 'var(--tt-selection)',
          border: '1px solid var(--tt-border-active)',
          color: canWrite ? 'var(--tt-bg)' : 'var(--tt-comment)',
          cursor: canWrite ? 'pointer' : 'not-allowed',
          fontWeight: 700,
          padding: '10px 12px',
          width: '100%',
        }}
      >
        write evals.json
      </button>
      {downloaded ? (
        <span role="status" style={{ color: 'var(--tt-green)', fontSize: 13 }}>
          download started
        </span>
      ) : null}
    </Column>
  );
};
