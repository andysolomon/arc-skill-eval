import { useMemo, useState } from 'react';
import { Column, Kicker } from '@/components/primitives';
import { useWriteEvalsJson } from './useWriteEvalsJson';
import type { CreateDraft, EvalsJsonDraft } from './useDraft';

type StepReviewProps = {
  assertionCount: number;
  draft: CreateDraft;
  env: 'hosted' | 'localhost';
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

const secondaryButtonStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  cursor: 'pointer',
  padding: '8px 10px',
};

export const StepReview = ({ assertionCount, draft, env, evalsJson }: StepReviewProps) => {
  const [downloaded, setDownloaded] = useState(false);
  const { cancelPlan, commitPlan, error, plan, stagePlan, status, wrotePath } = useWriteEvalsJson();
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
  const isLocalhost = env !== 'hosted';
  const writeInFlight = status === 'staging' || status === 'committing' || status === 'cancelling';
  const handleWrite = () => {
    if (!canWrite) {
      return;
    }

    if (!isLocalhost) {
      downloadEvalsJson(evalsJson);
      setDownloaded(true);
      return;
    }

    void stagePlan({ workspaceRoot: draft.skillPath, plan: evalsJson }).catch(() => undefined);
  };
  const handleCommit = () => {
    void commitPlan().catch(() => undefined);
  };
  const handleCancel = () => {
    void cancelPlan().catch(() => undefined);
  };

  return (
    <Column gap={4}>
      <Kicker>step 04</Kicker>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>review</h1>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          Check the suite summary before writing the evals.json artifact.
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

      {env === 'hosted' ? (
        <section
          aria-label="hosted write note"
          data-env={env}
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
            Hosted writes download evals.json locally. Disk writes need the localhost daemon.
          </p>
        </section>
      ) : null}

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
        disabled={!canWrite || writeInFlight}
        onClick={handleWrite}
        type="button"
        style={{
          background: canWrite ? (isLocalhost ? 'var(--tt-green)' : 'var(--tt-cyan)') : 'var(--tt-selection)',
          border: '1px solid var(--tt-border-active)',
          color: canWrite ? 'var(--tt-bg)' : 'var(--tt-comment)',
          cursor: canWrite && !writeInFlight ? 'pointer' : 'not-allowed',
          fontWeight: 700,
          padding: '10px 12px',
          width: '100%',
        }}
      >
        {status === 'staging' ? 'staging evals.json' : 'write evals.json'}
      </button>
      {plan ? (
        <section
          aria-label="staging diff"
          style={{
            border: '1px solid var(--tt-green)',
            display: 'grid',
            gap: 10,
            padding: 12,
          }}
        >
          <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
            staged {plan.planId} at {plan.stagingPath}
          </span>
          <pre
            style={{
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              color: 'var(--tt-fg-dark)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
              fontSize: 12,
              margin: 0,
              overflow: 'auto',
              padding: 10,
              whiteSpace: 'pre-wrap',
            }}
          >
            {JSON.stringify(plan.diff, null, 2)}
          </pre>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              disabled={writeInFlight}
              onClick={handleCommit}
              type="button"
              style={{
                ...secondaryButtonStyle,
                background: writeInFlight ? 'var(--tt-selection)' : 'var(--tt-green)',
                color: writeInFlight ? 'var(--tt-comment)' : 'var(--tt-bg)',
                fontWeight: 700,
              }}
            >
              commit
            </button>
            <button
              disabled={writeInFlight}
              onClick={handleCancel}
              type="button"
              style={{
                ...secondaryButtonStyle,
                color: writeInFlight ? 'var(--tt-comment)' : 'var(--tt-fg)',
              }}
            >
              cancel
            </button>
          </div>
        </section>
      ) : null}
      {downloaded && env === 'hosted' ? (
        <span role="status" style={{ color: 'var(--tt-green)', fontSize: 13 }}>
          download started
        </span>
      ) : null}
      {status === 'committed' ? (
        <span role="status" style={{ color: 'var(--tt-green)', fontSize: 13 }}>
          wrote evals.json{wrotePath ? ` to ${wrotePath}` : ''}
        </span>
      ) : null}
      {status === 'cancelled' ? (
        <span role="status" style={{ color: 'var(--tt-comment)', fontSize: 13 }}>
          cancelled staged write
        </span>
      ) : null}
      {error ? (
        <span role="alert" style={{ color: 'var(--tt-red)', fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </Column>
  );
};
