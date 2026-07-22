import { Column, EmptyState, Kicker } from '@/components/primitives';
import { useSuggest } from './useSuggest';
import type { CreateDraft } from './useDraft';

type StepPromptsProps = {
  behaviorCount: number;
  draft: CreateDraft;
  env: 'hosted' | 'localhost';
  onAdd: () => void;
  onGoToBehaviors: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, text: string) => void;
};

const buttonStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  cursor: 'pointer',
  padding: '7px 9px',
};

const parseBehaviorBullets = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

export const StepPrompts = ({
  behaviorCount,
  draft,
  env,
  onAdd,
  onGoToBehaviors,
  onRemove,
  onUpdate,
}: StepPromptsProps) => {
  const { error, pendingKey, suggestPrompt } = useSuggest();
  const behaviors = parseBehaviorBullets(draft.behaviorBullets);

  const handleSuggest = (promptId: string, promptText: string, index: number) => {
    const behavior = behaviors[index] ?? behaviors[0] ?? '';

    void suggestPrompt({
      behavior,
      currentPrompt: promptText,
      rowId: promptId,
      workspaceRoot: draft.skillPath,
    })
      .then((suggestion) => onUpdate(promptId, suggestion))
      .catch(() => undefined);
  };

  return (
    <Column gap={4}>
      <Kicker>step 02</Kicker>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>
          turn behaviors into prompts
        </h1>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          Add the user prompts that should exercise the behaviors. Each filled row becomes one case.
        </p>
      </div>

      {behaviorCount === 0 ? (
        <EmptyState
          title="No behaviors yet"
          body="List at least one behavior before writing prompts."
          action={{ label: 'edit behaviors', onClick: onGoToBehaviors }}
        />
      ) : null}

      <div
        aria-label="prompt flavor legend"
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
          <strong style={{ color: 'var(--tt-cyan)' }}>explicit</strong> includes the behavior directly
        </span>
        <span>
          <strong style={{ color: 'var(--tt-green)' }}>implicit</strong> paraphrases the requirement
        </span>
        <span>
          <strong style={{ color: 'var(--tt-magenta)' }}>contextual</strong> relies on setup context
        </span>
        <span>
          <strong style={{ color: 'var(--tt-yellow)' }}>adjacent-negative</strong> guards against nearby mistakes
        </span>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {draft.prompts.map((prompt, index) => (
          <section
            aria-label={`prompt ${index + 1}`}
            key={prompt.id}
            style={{
              border: '1px solid var(--tt-border)',
              display: 'grid',
              gap: 8,
              padding: 10,
            }}
          >
            <div
              style={{
                alignItems: 'center',
                display: 'flex',
                gap: 8,
                justifyContent: 'space-between',
              }}
            >
              <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
                prompt {String(index + 1).padStart(2, '0')}
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                {env !== 'hosted' ? (
                  <button
                    disabled={pendingKey === `prompt:${prompt.id}`}
                    onClick={() => handleSuggest(prompt.id, prompt.text, index)}
                    style={{
                      ...buttonStyle,
                      borderColor: 'var(--tt-green)',
                      color: 'var(--tt-green)',
                      cursor: pendingKey === `prompt:${prompt.id}` ? 'wait' : 'pointer',
                    }}
                    type="button"
                  >
                    suggest
                  </button>
                ) : null}
                <button onClick={() => onRemove(prompt.id)} style={buttonStyle} type="button">
                  remove
                </button>
              </div>
            </div>
            <textarea
              aria-label={`prompt body ${index + 1}`}
              onChange={(event) => onUpdate(prompt.id, event.target.value)}
              placeholder="Ask the agent to perform the task in a way that reveals the behavior."
              rows={4}
              style={{
                background: 'var(--tt-bg-dark)',
                border: '1px solid var(--tt-border)',
                color: 'var(--tt-fg)',
                font: 'inherit',
                lineHeight: 1.5,
                minWidth: 0,
                outlineColor: 'var(--tt-border-active)',
                padding: '8px 10px',
                resize: 'vertical',
                width: '100%',
              }}
              value={prompt.text}
            />
            <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>
              {prompt.text.length} chars
            </span>
          </section>
        ))}
      </div>

      {error ? (
        <span role="alert" style={{ color: 'var(--tt-red)', fontSize: 13 }}>
          {error}
        </span>
      ) : null}

      <button
        onClick={onAdd}
        type="button"
        style={{
          ...buttonStyle,
          borderStyle: 'dashed',
          justifySelf: 'start',
        }}
      >
        add prompt
      </button>
    </Column>
  );
};
