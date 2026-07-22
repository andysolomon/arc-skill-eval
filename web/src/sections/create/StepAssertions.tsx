import { Column, Kicker } from '@/components/primitives';
import { useSuggest } from './useSuggest';
import type { AssertionKind, CreateDraft } from './useDraft';

type StepAssertionsProps = {
  draft: CreateDraft;
  env: 'hosted' | 'localhost';
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: { kind?: AssertionKind; body?: string }) => void;
};

const assertionHints: Record<AssertionKind, string> = {
  judge: 'The assistant asks for confirmation before mutating git history.',
  script: '{ "type": "file-exists", "path": "evals/evals.json" }',
  diff: 'outputs/expected.json',
};

const controlStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  font: 'inherit',
  outlineColor: 'var(--tt-border-active)',
  padding: '8px 10px',
};

const buttonStyle = {
  background: 'var(--tt-bg-dark)',
  border: '1px solid var(--tt-border)',
  color: 'var(--tt-fg)',
  cursor: 'pointer',
  padding: '8px 10px',
};

const parseBehaviorBullets = (value: string): string[] =>
  value
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s*/, '').trim())
    .filter(Boolean);

export const StepAssertions = ({ draft, env, onAdd, onRemove, onUpdate }: StepAssertionsProps) => {
  const { error, pendingKey, suggestAssertion } = useSuggest();
  const behaviors = parseBehaviorBullets(draft.behaviorBullets);

  const handleSuggest = (assertionId: string, kind: AssertionKind, index: number) => {
    const behavior = behaviors[index] ?? behaviors[0] ?? '';
    const prompt = draft.prompts[index]?.text ?? draft.prompts[0]?.text ?? '';

    void suggestAssertion({
      behavior,
      kind,
      prompt,
      rowId: assertionId,
      workspaceRoot: draft.skillPath,
    })
      .then((suggestion) => onUpdate(assertionId, { body: suggestion }))
      .catch(() => undefined);
  };

  return (
    <Column gap={4}>
      <Kicker>step 03</Kicker>
      <div style={{ display: 'grid', gap: 8 }}>
        <h1 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>
          attach assertions
        </h1>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>
          Keep assertions concrete. Judge rows become prose assertions; script rows can accept a JSON object.
        </p>
      </div>

      <section
        aria-label="assertion hint"
        style={{
          background: 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border)',
          borderLeft: '4px solid var(--tt-cyan)',
          color: 'var(--tt-fg-dark)',
          lineHeight: 1.5,
          padding: 12,
        }}
      >
        Good assertions are deterministic or judge-prompted; weak ones script regexes hoping for
        the right shape.
      </section>

      <div style={{ display: 'grid', gap: 10 }}>
        {draft.assertions.map((assertion, index) => (
          <section
            aria-label={`assertion ${index + 1}`}
            key={assertion.id}
            style={{
              border: '1px solid var(--tt-border)',
              display: 'grid',
              gap: 8,
              gridTemplateColumns: '140px minmax(0, 1fr) auto',
              padding: 10,
            }}
          >
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>type</span>
              <select
                aria-label={`assertion type ${index + 1}`}
                onChange={(event) =>
                  onUpdate(assertion.id, { kind: event.target.value as AssertionKind })
                }
                style={controlStyle}
                value={assertion.kind}
              >
                <option value="judge">judge</option>
                <option value="script">script</option>
                <option value="diff">diff</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span
                style={{
                  alignItems: 'center',
                  color: 'var(--tt-comment)',
                  display: 'flex',
                  fontSize: 12,
                  gap: 8,
                  justifyContent: 'space-between',
                }}
              >
                editor
                {env !== 'hosted' ? (
                  <button
                    disabled={pendingKey === `assertion:${assertion.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      handleSuggest(assertion.id, assertion.kind, index);
                    }}
                    style={{
                      ...buttonStyle,
                      borderColor: 'var(--tt-green)',
                      color: 'var(--tt-green)',
                      cursor: pendingKey === `assertion:${assertion.id}` ? 'wait' : 'pointer',
                      padding: '5px 7px',
                    }}
                    type="button"
                  >
                    suggest
                  </button>
                ) : null}
              </span>
              <textarea
                aria-label={`assertion editor ${index + 1}`}
                onChange={(event) => onUpdate(assertion.id, { body: event.target.value })}
                placeholder={assertionHints[assertion.kind]}
                rows={3}
                style={{
                  ...controlStyle,
                  lineHeight: 1.5,
                  minWidth: 0,
                  resize: 'vertical',
                  width: '100%',
                }}
                value={assertion.body}
              />
            </label>
            <button
              onClick={() => onRemove(assertion.id)}
              type="button"
              style={{ ...buttonStyle, alignSelf: 'end' }}
            >
              remove
            </button>
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
        add assertion
      </button>
    </Column>
  );
};
