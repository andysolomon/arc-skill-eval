import { useRef } from 'react';
import type { EnvName } from '@/persistence/preferences';
import { useSuggest } from './useSuggest';
import {
  assertionKindColor,
  assertionKinds,
  assertionPlaceholder,
  dimensionColors,
  type AssertionKind,
  type CreateDraft,
} from './useDraft';
import { cardStyle, inputStyle, kickerStyle, legendBoxStyle, introStyle, removeGlyphStyle, titleStyle } from './stepStyles';

type StepAssertionsProps = {
  assistModel: string;
  draft: CreateDraft;
  env: EnvName;
  onAddAssertion: (behaviorId: string, kind: AssertionKind) => void;
  onRemoveAssertion: (behaviorId: string, index: number) => void;
  onSetAssertionValue: (behaviorId: string, index: number, val: string) => void;
};

export const StepAssertions = ({
  assistModel,
  draft,
  env,
  onAddAssertion,
  onRemoveAssertion,
  onSetAssertionValue,
}: StepAssertionsProps) => {
  const { error, pendingKey, suggestAssertion } = useSuggest(env === 'localhost', assistModel);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const handleSuggest = (behaviorId: string) => {
    const behavior = draft.behaviors.find((row) => row.id === behaviorId);
    if (!behavior) {
      return;
    }

    void suggestAssertion({
      behavior: behavior.text,
      prompt: behavior.prompt,
      rowId: behavior.id,
      skill: draft.skill,
    })
      .then((assertion) => {
        const current = draftRef.current.behaviors.find((row) => row.id === behavior.id);
        const index = current?.asserts.length ?? behavior.asserts.length;
        onAddAssertion(behavior.id, assertion.kind);
        onSetAssertionValue(behavior.id, index, assertion.val);
      })
      .catch(() => undefined);
  };

  return (
    <div>
    <div style={kickerStyle}>step 03</div>
    <h1 style={titleStyle}>Attach assertions</h1>
    <p style={introStyle}>
      add the checks that decide pass or fail. reach for{' '}
      <span style={{ color: 'var(--tt-cyan)' }}>deterministic</span> ones first (a script
      decides); add a <span style={{ color: 'var(--tt-magenta)' }}>judge</span> only for prose a
      script can't see.
    </p>

    <div aria-label="assertion examples" style={legendBoxStyle}>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ color: 'var(--tt-green)', flex: 'none', fontWeight: 700, width: 20 }}>✓</span>
        <span style={{ color: 'var(--tt-comment)' }}>
          "the workflow triggers on pull_request" — one observable claim, checkable the same way
          twice
        </span>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <span style={{ color: 'var(--tt-red)', flex: 'none', fontWeight: 700, width: 20 }}>✗</span>
        <span style={{ color: 'var(--tt-comment)' }}>
          "the output is good" — too vague to grade; "says exactly: setup complete" — too
          brittle, fails a correct paraphrase
        </span>
      </div>
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

        {behavior.asserts.length === 0 ? (
          <div style={{ color: 'var(--tt-comment)', fontSize: 12, padding: '4px 0 10px' }}>
            no checks yet — add one below.
          </div>
        ) : null}

        {behavior.asserts.map((assertion, index) => (
          <div
            key={`${assertion.kind}-${index}`}
            style={{ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 7 }}
          >
            <span
              style={{
                color: assertionKindColor(assertion.kind),
                flex: 'none',
                fontSize: 11.5,
                lineHeight: 1.3,
                width: 112,
                wordBreak: 'break-word',
              }}
            >
              {assertion.kind}
            </span>
            <input
              aria-label={`${assertion.kind} assertion`}
              onChange={(event) => onSetAssertionValue(behavior.id, index, event.target.value)}
              placeholder={assertionPlaceholder(assertion.kind)}
              value={assertion.val}
              style={{ ...inputStyle, flex: 1, fontSize: 12.5, minWidth: 0, padding: '7px 10px' }}
            />
            <button
              aria-label="remove assertion"
              onClick={() => onRemoveAssertion(behavior.id, index)}
              style={{ ...removeGlyphStyle, fontSize: 15 }}
              type="button"
            >
              ×
            </button>
          </div>
        ))}

        <div
          style={{
            alignItems: 'center',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 6,
            marginTop: 10,
          }}
        >
          {assertionKinds.map((kind) => (
            <button
              key={kind}
              onClick={() => onAddAssertion(behavior.id, kind)}
              type="button"
              style={{
                background: 'transparent',
                border: '1px dashed var(--tt-border)',
                borderRadius: 5,
                color: assertionKindColor(kind),
                cursor: 'pointer',
                fontSize: 11,
                padding: '3px 9px',
              }}
            >
              ＋ {kind}
            </button>
          ))}
          {env === 'localhost' ? (
            <>
              <span style={{ flex: 1 }} />
              <button
                disabled={pendingKey !== null}
                onClick={() => handleSuggest(behavior.id)}
                type="button"
                style={{
                  background: 'transparent',
                  border: 0,
                  color: 'var(--tt-yellow)',
                  cursor:
                    pendingKey === `assertion:${behavior.id}` ? 'wait' : 'pointer',
                  fontSize: 12,
                  padding: 0,
                }}
              >
                {pendingKey === `assertion:${behavior.id}`
                  ? '◌ generating…'
                  : '✦ suggest an assertion'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    ))}

      {error ? (
        <div role="alert" style={{ color: 'var(--tt-red)', fontSize: 12 }}>
          {error}
        </div>
      ) : null}
    </div>
  );
};
