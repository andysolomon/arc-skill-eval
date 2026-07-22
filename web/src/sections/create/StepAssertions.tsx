import { Column, Kicker } from '@/components/primitives';
import type { AssertionKind, CreateDraft } from './useDraft';

type StepAssertionsProps = {
  draft: CreateDraft;
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

export const StepAssertions = ({ draft, onAdd, onRemove, onUpdate }: StepAssertionsProps) => (
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
            <span style={{ color: 'var(--tt-comment)', fontSize: 12 }}>editor</span>
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
            style={{
              alignSelf: 'end',
              background: 'var(--tt-bg-dark)',
              border: '1px solid var(--tt-border)',
              color: 'var(--tt-fg)',
              cursor: 'pointer',
              padding: '8px 10px',
            }}
          >
            remove
          </button>
        </section>
      ))}
    </div>

    <button
      onClick={onAdd}
      type="button"
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px dashed var(--tt-border)',
        color: 'var(--tt-fg)',
        cursor: 'pointer',
        justifySelf: 'start',
        padding: '8px 10px',
      }}
    >
      add assertion
    </button>
  </Column>
);
