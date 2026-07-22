import { useState } from 'react';
import { EmptyState } from '@/components/primitives';

export const RUN_INSTALL_COMMAND = 'arc-skill-eval run --compare';

type InstallCommandPillProps = {
  command?: string;
};

export const InstallCommandPill = ({ command = RUN_INSTALL_COMMAND }: InstallCommandPillProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      aria-label="Install Command Pill"
      style={{
        alignItems: 'center',
        background: 'var(--tt-bg)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        display: 'inline-grid',
        gap: 8,
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        maxWidth: '100%',
        padding: 6,
      }}
    >
      <code
        style={{
          color: 'var(--tt-green)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.4,
          overflowWrap: 'anywhere',
        }}
      >
        $ {command}
      </code>
      <button
        aria-label={`copy ${command}`}
        onClick={handleCopy}
        type="button"
        style={{
          background: copied ? 'var(--tt-selection)' : 'var(--tt-bg-dark)',
          border: '1px solid var(--tt-border-active)',
          color: copied ? 'var(--tt-fg)' : 'var(--tt-cyan)',
          cursor: 'copy',
          fontSize: 12,
          lineHeight: 1,
          padding: '7px 9px',
          whiteSpace: 'nowrap',
        }}
      >
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
};

export const RunEmptyState = () => (
  <div style={{ display: 'grid', gap: 12, width: 'min(100%, 560px)' }}>
    <EmptyState
      title="localhost only"
      body="Hosted can prepare the command, but eval execution needs a local workspace and the CLI."
      env="hosted"
    />
    <InstallCommandPill />
  </div>
);
