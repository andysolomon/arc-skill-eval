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
  draft: CreateDraft;
  env: EnvName;
  onUpdateBehavior: (id: string, patch: Partial<Omit<BehaviorRow, 'id'>>) => void;
  workspaceRoot: string;
};

const flavorLegend: Array<{ flavor: string; copy: string }> = [
  { flavor: 'explicit', copy: 'names the skill directly — your smoke test' },
  {
    flavor: 'implicit',
    copy: 'describes the scenario without naming it — tests whether the description earns the trigger',
  },
  { flavor: 'contextual', copy: 'a noisy real-world ask with distractions — closest to production' },
  {
    flavor: 'adjacent-negative',
    copy: 'a nearby request the skill must NOT fire for — catches false positives',
  },
];

export const StepPrompts = ({ draft, env, onUpdateBehavior, workspaceRoot }: StepPromptsProps) => {
  const { error, pendingKey, suggestPrompt } = useSuggest();

  const handleSuggest = (behavior: BehaviorRow) => {
    const fallback = suggestPromptTemplate(draft.skill, behavior);

    if (env !== 'localhost') {
      onUpdateBehavior(behavior.id, { prompt: fallback });
      return;
    }

    void suggestPrompt({
      behavior: behavior.text,
      currentPrompt: behavior.prompt,
      rowId: behavior.id,
      workspaceRoot,
    })
      .then((suggestion) => onUpdateBehavior(behavior.id, { prompt: suggestion }))
      .catch(() => onUpdateBehavior(behavior.id, { prompt: fallback }));
  };

  return (
    <div>
      <div style={kickerStyle}>step 02</div>
      <h1 style={titleStyle}>Turn behaviors into prompts</h1>
      <p style={introStyle}>
        write the request a real user would send for each behavior. pick a flavor — it decides
        how hard the trigger boundary is tested. stuck? hit{' '}
        <span style={{ color: 'var(--tt-fg)' }}>suggest</span>.
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
            placeholder="the user's request, in their words…"
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
            <span style={{ flex: 1 }} />
            <button
              disabled={pendingKey === `prompt:${behavior.id}`}
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
              ✦ suggest
            </button>
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
