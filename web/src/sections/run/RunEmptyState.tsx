import { useState } from 'react';

import { sections, useSection } from '@/state/section';

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
    <button
      aria-label={`copy ${command}`}
      onClick={handleCopy}
      type="button"
      style={{
        alignItems: 'center',
        background: 'var(--tt-bg)',
        border: '1px solid var(--tt-border)',
        borderRadius: 7,
        color: 'var(--tt-fg-dark)',
        cursor: 'pointer',
        display: 'inline-flex',
        fontSize: 13,
        gap: 8,
        height: 30,
        padding: '0 12px',
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ color: 'var(--tt-green)' }}>$</span>
      {command}
      <span style={{ color: copied ? 'var(--tt-green)' : 'var(--tt-comment)', fontSize: 12 }}>
        {copied ? '✓ copied' : '⧉'}
      </span>
    </button>
  );
};

export const RunEmptyState = () => {
  const { setActiveSection } = useSection();

  const goTo = (name: 'review' | 'learn') => (event: React.MouseEvent) => {
    event.preventDefault();
    const section = sections.find((candidate) => candidate.name === name);
    if (section) {
      setActiveSection(section);
    }
  };

  return (
    <div
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        borderRadius: 10,
        maxWidth: 560,
        padding: '24px 26px',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          display: 'flex',
          flexWrap: 'wrap',
          gap: 9,
          marginBottom: 10,
        }}
      >
        <span
          data-testid="run-empty-state-kicker"
          style={{
            border: '1px solid var(--tt-cyan)',
            borderRadius: 5,
            color: 'var(--tt-cyan)',
            fontSize: 11,
            fontWeight: 700,
            padding: '2px 7px',
          }}
        >
          localhost only
        </span>
        <span style={{ color: 'var(--tt-fg)', fontSize: 17, fontWeight: 700 }}>
          running an eval needs an LLM
        </span>
      </div>
      <div
        style={{
          color: 'var(--tt-fg-dark)',
          fontSize: 13,
          lineHeight: 1.65,
          marginBottom: 16,
        }}
      >
        a run drives a real model over your cases, so it executes where you have your own keys and
        command line — not on the hosted site. install it and run locally:
      </div>
      <div
        style={{
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-border)',
          borderRadius: 8,
          fontSize: 13,
          lineHeight: 1.9,
          marginBottom: 16,
          padding: '12px 14px',
        }}
      >
        <div>
          <span style={{ color: 'var(--tt-green)' }}>$ </span>
          <span style={{ color: 'var(--tt-fg)' }}>npm i -g arc-skill-eval</span>
        </div>
        <div>
          <span style={{ color: 'var(--tt-green)' }}>$ </span>
          <span style={{ color: 'var(--tt-fg)' }}>
            arc-skill-eval run ./skills/my-skill --compare
          </span>
        </div>
      </div>
      <div style={{ color: 'var(--tt-comment)', fontSize: 12.5, lineHeight: 1.6 }}>
        here on the hosted site you can{' '}
        <a href="#" onClick={goTo('review')}>
          review the JSON arc-skill-eval produces
        </a>{' '}
        or read the{' '}
        <a href="#" onClick={goTo('learn')}>
          methodology in learn
        </a>
        .
      </div>
    </div>
  );
};
