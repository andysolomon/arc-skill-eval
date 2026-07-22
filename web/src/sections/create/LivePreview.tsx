import type { EvalsJsonDraft } from './useDraft';

type LivePreviewProps = {
  evalsJson: EvalsJsonDraft;
};

export const LivePreview = ({ evalsJson }: LivePreviewProps) => (
  <aside
    aria-label="Live evals json preview"
    data-testid="create-live-preview"
    style={{
      background: 'var(--tt-bg-dark)',
      border: '1px solid var(--tt-border)',
      color: 'var(--tt-fg)',
      display: 'grid',
      gap: 10,
      gridTemplateRows: 'auto minmax(0, 1fr)',
      minHeight: 0,
      padding: 12,
      width: 344,
    }}
  >
    <div style={{ alignItems: 'center', display: 'flex', gap: 8, justifyContent: 'space-between' }}>
      <span
        style={{
          color: 'var(--tt-comment)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          textTransform: 'uppercase',
        }}
      >
        evals.json
      </span>
      <span
        aria-label="live preview"
        style={{
          alignItems: 'center',
          color: 'var(--tt-green)',
          display: 'inline-flex',
          fontSize: 12,
          gap: 6,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            background: 'var(--tt-green)',
            display: 'inline-block',
            height: 8,
            width: 8,
          }}
        />
        live
      </span>
    </div>
    <pre
      style={{
        background: 'var(--tt-bg)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg-dark)',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.45,
        margin: 0,
        minHeight: 0,
        overflow: 'auto',
        padding: 12,
        whiteSpace: 'pre-wrap',
      }}
    >
      {JSON.stringify(evalsJson, null, 2)}
    </pre>
  </aside>
);
