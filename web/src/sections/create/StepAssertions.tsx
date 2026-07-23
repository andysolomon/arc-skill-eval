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
  draft: CreateDraft;
  onAddAssertion: (behaviorId: string, kind: AssertionKind) => void;
  onRemoveAssertion: (behaviorId: string, index: number) => void;
  onSetAssertionValue: (behaviorId: string, index: number, val: string) => void;
};

export const StepAssertions = ({
  draft,
  onAddAssertion,
  onRemoveAssertion,
  onSetAssertionValue,
}: StepAssertionsProps) => (
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
                width: 88,
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

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
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
        </div>
      </div>
    ))}
  </div>
);
