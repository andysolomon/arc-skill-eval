import { Kicker } from '@/components/primitives';

const assembledCommand = `# COMMAND
arc-skill-eval run <skill-dir> \\
  --case "*" \\
  --model "anthropic/claude-sonnet-4" \\
  --judge-model "anthropic/claude-sonnet-4" \\
  --compare \\
  --extra-skill ./path/to/extra-skill \\
  --iteration 1 \\
  --context-mode isolated \\
  --sandbox none

# hosted is read-only; run this command from localhost`;

export const RunConsole = () => (
  <section
    aria-disabled="true"
    aria-label="Run console hosted stub"
    style={{
      background: 'var(--tt-bg-dark)',
      border: '1px solid var(--tt-border)',
      color: 'var(--tt-fg)',
      minHeight: 320,
      minWidth: 0,
      padding: 16,
    }}
  >
    <div style={{ display: 'grid', gap: 12 }}>
      <Kicker>console</Kicker>
      <pre
        aria-label="assembled CLI command"
        aria-readonly="true"
        style={{
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          color: 'var(--tt-fg-dark)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.6,
          margin: 0,
          minHeight: 240,
          overflow: 'auto',
          padding: 12,
          whiteSpace: 'pre-wrap',
        }}
      >
        {assembledCommand}
      </pre>
    </div>
  </section>
);
