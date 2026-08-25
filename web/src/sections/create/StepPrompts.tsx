import type { EnvName } from '@/persistence/preferences';
import { useSuggest } from './useSuggest';
import {
  dimensionColors,
  flavorColors,
  flavors,
  suggestPromptTemplate,
  type BehaviorRow,
  type CreateDraft,
} from './useDraft';
import { cardStyle, inputStyle, kickerStyle, legendBoxStyle, introStyle, titleStyle } from './stepStyles';

type StepPromptsProps = {
  assistModel: string;
  draft: CreateDraft;
  env: EnvName;
  onUpdateBehavior: (id: string, patch: Partial<Omit<BehaviorRow, 'id'>>) => void;
};

const flavorLegend: Array<{ flavor: string; copy: string }> = [
  { flavor: 'explicit', copy: 'Names the skill directly; use it as a smoke test' },
  {
    flavor: 'implicit',
    copy: 'Describes the scenario without naming the skill; tests the description',
  },
  { flavor: 'contextual', copy: 'Adds relevant context and unrelated details' },
  {
    flavor: 'adjacent-negative',
    copy: 'Defines a nearby request that must not trigger the skill',
  },
];

export const StepPrompts = ({ assistModel, draft, env, onUpdateBehavior }: StepPromptsProps) => {
  const { error, pendingKey, suggestFlavor, suggestPrompt } = useSuggest(
    env === 'localhost',
    assistModel,
  );

  const handleSuggestFlavor = (behavior: BehaviorRow) => {
    if (env !== 'localhost' || !behavior.prompt.trim()) {
      return;
    }

    void suggestFlavor({
      behavior: behavior.text,
      prompt: behavior.prompt,
      rowId: behavior.id,
      skill: draft.skill,
    })
      .then((flavor) => onUpdateBehavior(behavior.id, { flavor }))
      .catch(() => undefined);
  };

  const handleSuggest = (behavior: BehaviorRow) => {
    const fallback = suggestPromptTemplate(draft.skill, behavior);

    if (env !== 'localhost') {
      onUpdateBehavior(behavior.id, { prompt: fallback });
      return;
    }

    void suggestPrompt({
      behavior: behavior.text,
      dim: behavior.dim,
      flavor: behavior.flavor,
      rowId: behavior.id,
      skill: draft.skill,
    })
      .then((suggestion) => onUpdateBehavior(behavior.id, { prompt: suggestion }))
      .catch(() => onUpdateBehavior(behavior.id, { prompt: fallback }));
  };

  return (
    <div>
      <div style={kickerStyle}>step 02</div>
      <h1 style={titleStyle}>Turn behaviors into prompts</h1>
      <p style={introStyle}>
        Write one user request for each behavior. Choose a prompt type to control how the case
        tests skill selection. Select <span style={{ color: 'var(--tt-fg)' }}>Suggest</span> to
        draft a prompt.
      </p>

      <div aria-label="prompt flavor legend" style={legendBoxStyle}>
        {flavorLegend.map((entry) => (
          <div key={entry.flavor} style={{ display: 'flex', gap: 10 }}>
            <span
              style={{
                color: flavorColors[entry.flavor as keyof typeof flavorColors],
                flex: 'none',
                fontWeight: 700,
                width: 124,
              }}
            >
              {entry.flavor}
            </span>
            <span style={{ color: 'var(--tt-comment)' }}>{entry.copy}</span>
          </div>
        ))}
      </div>

      {draft.behaviors.map((behavior) => (
        <div key={behavior.id} style={cardStyle}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginBottom: 10 }}>
            <span
              aria-hidden="true"
              style={{
                background: dimensionColors[behavior.dim],
                borderRadius: '50%',
                flex: 'none',
                height: 7,
                width: 7,
              }}
            />
            <span style={{ color: 'var(--tt-fg-dark)', fontSize: 12.5 }}>
              {behavior.text || '(unnamed behavior)'}
            </span>
          </div>
          <textarea
            aria-label={`prompt for ${behavior.text || 'unnamed behavior'}`}
            onChange={(event) => onUpdateBehavior(behavior.id, { prompt: event.target.value })}
            placeholder="Enter the user's request…"
            value={behavior.prompt}
            style={{
              ...inputStyle,
              height: 58,
              lineHeight: 1.5,
              padding: '9px 10px',
              resize: 'none',
              width: '100%',
            }}
          />
          <div
            style={{
              alignItems: 'center',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginTop: 9,
            }}
          >
            {flavors.map((flavor) => {
              const active = behavior.flavor === flavor;
              const color = flavorColors[flavor];

              return (
                <button
                  aria-pressed={active}
                  key={flavor}
                  onClick={() => onUpdateBehavior(behavior.id, { flavor })}
                  type="button"
                  style={{
                    background: 'transparent',
                    border: `1px solid ${active ? color : 'var(--tt-border)'}`,
                    borderRadius: 5,
                    color: active ? color : 'var(--tt-comment)',
                    cursor: 'pointer',
                    fontSize: 11.5,
                    padding: '3px 10px',
                  }}
                >
                  {flavor}
                </button>
              );
            })}
            {env === 'localhost' && behavior.prompt.trim() ? (
              <button
                aria-label="classify flavor with LLM"
                disabled={pendingKey !== null}
                onClick={() => handleSuggestFlavor(behavior)}
                title="classify flavor with LLM"
                type="button"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--tt-yellow)',
                  cursor: pendingKey === `flavor:${behavior.id}` ? 'wait' : 'pointer',
                  fontSize: 12,
                  padding: '0 2px',
                }}
              >
                {pendingKey === `flavor:${behavior.id}` ? '◌' : '✦'}
              </button>
            ) : null}
            <span style={{ flex: 1 }} />
            {env === 'localhost' ? (
              <button
                disabled={pendingKey !== null}
                onClick={() => handleSuggest(behavior)}
                type="button"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--tt-yellow)',
                  cursor: pendingKey === `prompt:${behavior.id}` ? 'wait' : 'pointer',
                  fontSize: 12,
                  padding: 0,
                }}
              >
                {pendingKey === `prompt:${behavior.id}` ? '◌ Generating…' : '✦ Suggest prompt'}
              </button>
            ) : null}
          </div>
        </div>
      ))}

      {error ? (
        <span role="alert" style={{ color: 'var(--tt-red)', fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
};
