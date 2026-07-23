import { sections, useSection } from '@/state/section';
import type { EnvName } from '@/persistence/preferences';
import { useWriteEvalsJson } from './useWriteEvalsJson';
import type { CreateDraft, EvalsJsonDraft } from './useDraft';
import { kickerStyle, introStyle, titleStyle } from './stepStyles';

type StepReviewProps = {
  assertionCount: number;
  deterministicCount: number;
  draft: CreateDraft;
  env: EnvName;
  evalsJson: EvalsJsonDraft;
  judgeCount: number;
  onWritten: () => void;
  workspaceRoot: string;
  wrote: boolean;
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

const statCardStyle = {
  border: '1px solid var(--tt-border)',
  borderRadius: 8,
  flex: '1 1 40%',
  minWidth: 118,
  padding: '12px 16px',
} as const;

export const StepReview = ({
  assertionCount,
  deterministicCount,
  draft,
  env,
  evalsJson,
  judgeCount,
  onWritten,
  workspaceRoot,
  wrote,
}: StepReviewProps) => {
  const { setActiveSection } = useSection();
  const { cancelPlan, commitPlan, error, plan, stagePlan, status, wrotePath } =
    useWriteEvalsJson();
  const isLocalhost = env === 'localhost';
  const writeInFlight = status === 'staging' || status === 'committing' || status === 'cancelling';
  const command = `arc-skill-eval run ./skills/${draft.skill || 'my-skill'} --compare`;

  const gotoRun = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const runSection = sections.find((section) => section.name === 'run');
    if (runSection) {
      setActiveSection(runSection);
    }
  };

  const handleWrite = () => {
    if (wrote || writeInFlight) {
      return;
    }

    if (!isLocalhost) {
      downloadEvalsJson(evalsJson);
      onWritten();
      return;
    }

    void stagePlan({ workspaceRoot, plan: evalsJson }).catch(() => undefined);
  };

  const handleCommit = () => {
    void commitPlan()
      .then(() => onWritten())
      .catch(() => undefined);
  };

  const stats: Array<{ label: string; value: number; color: string }> = [
    { label: 'cases', value: draft.behaviors.length, color: 'var(--tt-fg)' },
    { label: 'assertions', value: assertionCount, color: 'var(--tt-fg)' },
    { label: 'deterministic', value: deterministicCount, color: 'var(--tt-cyan)' },
    { label: 'judge', value: judgeCount, color: 'var(--tt-magenta)' },
  ];

  return (
    <div>
      <div style={kickerStyle}>step 04</div>
      <h1 style={titleStyle}>Review &amp; run</h1>
      <p style={{ ...introStyle, marginBottom: 22 }}>
        this is your starter suite. write it, then run with{' '}
        <span style={{ color: 'var(--tt-fg)' }}>--compare</span> to see the difference the skill
        makes.
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
        {stats.map((stat) => (
          <section aria-label={`${stat.label} count`} key={stat.label} style={statCardStyle}>
            <div
              style={{
                color: 'var(--tt-comment)',
                fontSize: 11,
                textTransform: 'uppercase',
              }}
            >
              {stat.label}
            </div>
            <div style={{ color: stat.color, fontSize: 22, fontWeight: 700 }}>{stat.value}</div>
          </section>
        ))}
      </div>

      <div
        aria-label="run command"
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          fontSize: 13,
          marginBottom: 16,
          padding: '12px 15px',
        }}
      >
        <span style={{ color: 'var(--tt-green)' }}>$ </span>
        <span style={{ color: 'var(--tt-fg)' }}>{command}</span>
      </div>

      <div style={{ alignItems: 'center', display: 'flex', gap: 12 }}>
        <button
          data-testid="write-evals-json"
          disabled={writeInFlight}
          onClick={handleWrite}
          type="button"
          style={{
            alignItems: 'center',
            background: 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))',
            border: '1px solid var(--tt-green)',
            borderRadius: 7,
            color: 'var(--tt-green)',
            cursor: writeInFlight ? 'wait' : 'pointer',
            display: 'inline-flex',
            fontWeight: 700,
            gap: 8,
            height: 40,
            justifyContent: 'center',
            padding: '0 18px',
          }}
        >
          {status === 'staging'
            ? 'staging evals/evals.json…'
            : wrote
              ? '✓ wrote evals/evals.json'
              : 'write evals/evals.json'}
        </button>
        {wrote ? (
          <a href="#" onClick={gotoRun} style={{ fontSize: 13 }}>
            run it in the console →
          </a>
        ) : null}
      </div>

      {plan ? (
        <section
          aria-label="staging diff"
          style={{
            border: '1px solid var(--tt-green)',
            borderRadius: 8,
            display: 'grid',
            gap: 10,
            marginTop: 16,
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
              borderRadius: 6,
              color: 'var(--tt-fg-dark)',
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
                background: 'color-mix(in srgb, var(--tt-green) 14%, var(--tt-bg))',
                border: '1px solid var(--tt-green)',
                borderRadius: 7,
                color: 'var(--tt-green)',
                cursor: writeInFlight ? 'wait' : 'pointer',
                fontWeight: 700,
                padding: '7px 14px',
              }}
            >
              commit
            </button>
            <button
              disabled={writeInFlight}
              onClick={() => void cancelPlan().catch(() => undefined)}
              type="button"
              style={{
                background: 'transparent',
                border: '1px solid var(--tt-border)',
                borderRadius: 7,
                color: 'var(--tt-fg-dark)',
                cursor: writeInFlight ? 'wait' : 'pointer',
                padding: '7px 14px',
              }}
            >
              cancel
            </button>
          </div>
        </section>
      ) : null}

      {status === 'committed' ? (
        <div role="status" style={{ color: 'var(--tt-green)', fontSize: 12.5, marginTop: 12 }}>
          ✓ wrote evals.json{wrotePath ? ` to ${wrotePath}` : ''}
        </div>
      ) : null}
      {error ? (
        <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12.5, marginTop: 12 }}>
          ✗ {error}
        </div>
      ) : null}

      <div
        style={{
          borderTop: '1px solid var(--tt-border)',
          color: 'var(--tt-comment)',
          fontSize: 12,
          lineHeight: 1.6,
          marginTop: 20,
          paddingTop: 14,
        }}
      >
        then keep the loop going: <span style={{ color: 'var(--tt-fg-dark)' }}>review</span> the
        run, note what's off, and <span style={{ color: 'var(--tt-fg-dark)' }}>improve</span> —
        every fix becomes the next case.
      </div>
    </div>
  );
};
