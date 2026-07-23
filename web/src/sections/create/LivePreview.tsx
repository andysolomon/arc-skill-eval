import type { EvalsJsonDraft } from './useDraft';

type LivePreviewProps = {
  evalsJson: EvalsJsonDraft;
};

const punct = { color: 'var(--tt-comment)' };
const key = { color: 'var(--tt-yellow)' };

const formatObjectAssertion = (assertion: Record<string, unknown>) =>
  `{ ${Object.entries(assertion)
    .map(([field, value]) => `"${field}": "${String(value) || '…'}"`)
    .join(', ')} }`;

const AssertionLine = ({
  assertion,
  last,
}: {
  assertion: string | Record<string, unknown>;
  last: boolean;
}) => {
  const judge = typeof assertion === 'string';
  const text = judge ? `"${assertion || '…'}"` : formatObjectAssertion(assertion);

  return (
    <div style={{ paddingLeft: '8ch', whiteSpace: 'pre-wrap' }}>
      <span style={{ color: judge ? 'var(--tt-magenta)' : 'var(--tt-cyan)' }}>{text}</span>
      <span style={punct}>{last ? '' : ','}</span>
    </div>
  );
};

export const LivePreview = ({ evalsJson }: LivePreviewProps) => (
  <aside
    aria-label="Live evals json preview"
    data-testid="create-live-preview"
    style={{
      background: 'var(--tt-bg-dark)',
      borderLeft: '1px solid var(--tt-border)',
      display: 'flex',
      flex: 'none',
      flexDirection: 'column',
      minHeight: 0,
      width: 344,
    }}
  >
    <div
      style={{
        alignItems: 'center',
        borderBottom: '1px solid var(--tt-border)',
        display: 'flex',
        fontSize: 12,
        gap: 8,
        padding: '8px 14px',
      }}
    >
      <span style={{ color: 'var(--tt-fg-dark)', fontWeight: 700 }}>evals/evals.json</span>
      <span style={{ flex: 1 }} />
      <span
        aria-hidden="true"
        style={{
          background: 'var(--tt-green)',
          borderRadius: '50%',
          height: 6,
          width: 6,
        }}
      />
      <span aria-label="live preview" style={{ color: 'var(--tt-comment)', fontSize: 11 }}>
        live
      </span>
    </div>
    <div style={{ flex: 1, fontSize: 12, lineHeight: 1.7, overflow: 'auto', padding: '14px 16px' }}>
      <div>
        <span style={punct}>{'{'}</span>
      </div>
      <div style={{ paddingLeft: '2ch' }}>
        <span style={key}>"skill_name"</span>
        <span style={punct}>: </span>
        <span style={{ color: 'var(--tt-green)' }}>"{evalsJson.skill_name}"</span>
        <span style={punct}>,</span>
      </div>
      <div style={{ paddingLeft: '2ch' }}>
        <span style={key}>"evals"</span>
        <span style={punct}>: [</span>
      </div>
      {evalsJson.evals.map((testCase, index) => (
        <div key={testCase.id ?? index}>
          <div style={{ paddingLeft: '4ch' }}>
            <span style={punct}>{'{'}</span>
          </div>
          <div style={{ paddingLeft: '6ch' }}>
            <span style={key}>"id"</span>
            <span style={punct}>: </span>
            <span style={{ color: 'var(--tt-fg)' }}>"{testCase.id}"</span>
            <span style={punct}>,</span>
          </div>
          <div style={{ paddingLeft: '6ch', whiteSpace: 'pre-wrap' }}>
            <span style={key}>"prompt"</span>
            <span style={punct}>: </span>
            <span style={{ color: 'var(--tt-fg)' }}>"{testCase.prompt || '…'}"</span>
            <span style={punct}>,</span>
          </div>
          <div style={{ paddingLeft: '6ch' }}>
            <span style={key}>"assertions"</span>
            <span style={punct}>: [</span>
          </div>
          {testCase.assertions.map((assertion, assertionIndex) => (
            <AssertionLine
              assertion={assertion}
              key={assertionIndex}
              last={assertionIndex === testCase.assertions.length - 1}
            />
          ))}
          <div style={{ paddingLeft: '6ch' }}>
            <span style={punct}>]</span>
          </div>
          <div style={{ paddingLeft: '4ch' }}>
            <span style={punct}>
              {'}'}
              {index < evalsJson.evals.length - 1 ? ',' : ''}
            </span>
          </div>
        </div>
      ))}
      <div style={{ paddingLeft: '2ch' }}>
        <span style={punct}>]</span>
      </div>
      <div>
        <span style={punct}>{'}'}</span>
      </div>
    </div>
  </aside>
);
