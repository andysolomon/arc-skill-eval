import { Column, Kicker } from '@/components/primitives';
import { useGenerateEvals } from './useGenerateEvals';
import type { CreateDraft } from './useDraft';

type StepListBehaviorsProps = {
  draft: CreateDraft;
  env: 'hosted' | 'localhost';
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

const parseBehaviorBullets = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

const formatBehaviorBullets = (behaviors: string[]) =>
  behaviors.map((behavior) => `- ${behavior}`).join('\n');

const appendBehaviors = (currentValue: string, generated: string[]) => {
  const current = parseBehaviorBullets(currentValue);
  const next = [...current];

  generated.forEach((behavior) => {
    if (!next.includes(behavior)) {
      next.push(behavior);
    }
  });

  return formatBehaviorBullets(next);
};

export const StepListBehaviors = ({ draft, env, onChange }: StepListBehaviorsProps) => {
  const { error, generateEvals, isGenerating } = useGenerateEvals();

  const handleGenerate = () => {
    const behaviors = parseBehaviorBullets(draft.behaviorBullets);

    void generateEvals({ workspaceRoot: draft.skillPath, behaviors })
      .then((result) => {
        if (result.behaviors.length > 0) {
          onChange({ behaviorBullets: appendBehaviors(draft.behaviorBullets, result.behaviors) });
        }
      })
      .catch(() => undefined);
  };

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
      ) : (
        <section
          aria-label="localhost generate starter evals"
          data-env={env}
          style={{
            background: 'var(--tt-bg-dark)',
            border: '1px solid var(--tt-green)',
            borderLeft: '4px solid var(--tt-green)',
            display: 'grid',
            gap: 10,
            padding: 12,
          }}
        >
          <p style={{ color: 'var(--tt-fg)', margin: 0 }}>
            Generate starter evals from the selected local workspace.
          </p>
          <div
            aria-label="selected skill workspace"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}
          >
            <span
              style={{
                border: '1px solid var(--tt-border)',
                color: 'var(--tt-green)',
                fontSize: 12,
                padding: '3px 6px',
              }}
            >
              {draft.skillPath || '<workspace picker>'}
            </span>
          </div>
          <button
            disabled={isGenerating}
            onClick={handleGenerate}
            type="button"
            style={{
              background: isGenerating ? 'var(--tt-selection)' : 'var(--tt-green)',
              border: '1px solid var(--tt-border-active)',
              color: isGenerating ? 'var(--tt-comment)' : 'var(--tt-bg)',
              cursor: isGenerating ? 'wait' : 'pointer',
              fontWeight: 700,
              justifySelf: 'start',
              padding: '8px 10px',
            }}
          >
            {isGenerating ? 'generating' : 'generate evals'}
          </button>
          {error ? (
            <span role="alert" style={{ color: 'var(--tt-red)', fontSize: 13 }}>
              {error}
            </span>
          ) : null}
        </section>
      )}
    </Column>
  );
};
