import { Column, Kicker } from '@/components/primitives';
import { useEnv } from '@/state/env';
import type { CreateDraft } from './useDraft';

type StepListBehaviorsProps = {
  draft: CreateDraft;
  onChange: (patch: Partial<CreateDraft>) => void;
};

const fieldStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  font: 'inherit',
  minWidth: 0,
  outlineColor: 'var(--tt-border-active)',
  padding: '8px 10px',
  width: '100%',
};

export const StepListBehaviors = ({ draft, onChange }: StepListBehaviorsProps) => {
  const { env } = useEnv();

  return (
    <Column gap={4}>
      <Kicker>step 01</Kicker>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>
          list the behaviors that matter
        </h1>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          Capture one behavior per line. These become the descriptions and ids in the draft suite.
        </p>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>skill path</span>
        <input
          aria-label="skill path"
          onChange={(event) => onChange({ skillPath: event.target.value })}
          style={fieldStyle}
          value={draft.skillPath}
        />
      </label>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>skill name</span>
        <input
          aria-label="skill name"
          onChange={(event) => onChange({ skillName: event.target.value })}
          style={fieldStyle}
          value={draft.skillName}
        />
      </label>

      <div
        aria-label="behavior dimensions"
        style={{
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
          display: 'grid',
          fontSize: 13,
          gap: 6,
          padding: 10,
        }}
      >
        <span>
          <strong style={{ color: 'var(--tt-cyan)' }}>outcome</strong> pass/fail observations
        </span>
        <span>
          <strong style={{ color: 'var(--tt-green)' }}>process</strong> tools, skills, and steps taken
        </span>
        <span>
          <strong style={{ color: 'var(--tt-magenta)' }}>style</strong> formatting, tone, and structure
        </span>
        <span>
          <strong style={{ color: 'var(--tt-yellow)' }}>efficiency</strong> time and tool budget
        </span>
      </div>

      <label style={{ display: 'grid', gap: 6 }}>
        <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>behavior bullets</span>
        <textarea
          aria-label="behavior bullets"
          onChange={(event) => onChange({ behaviorBullets: event.target.value })}
          placeholder="- asks before destructive git operations"
          rows={8}
          style={{ ...fieldStyle, lineHeight: 1.5, resize: 'vertical' }}
          value={draft.behaviorBullets}
        />
      </label>

      {env === 'hosted' ? (
        <section
          aria-label="hosted generate evals note"
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
            generate evals unavailable
          </button>
        </section>
      ) : null}
    </Column>
  );
};
