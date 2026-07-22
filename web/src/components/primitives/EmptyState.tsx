import type { ReactNode } from 'react';
import { useEnv } from '@/state/env';
import { useSection } from '@/state/section';

type EmptyStateEnv = 'hosted' | 'localhost';

export type EmptyStateProps = {
  title: string;
  body: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  env?: EmptyStateEnv;
};

const isEnv = (value: string | undefined): value is EmptyStateEnv =>
  value === 'hosted' || value === 'localhost';

const readDocumentEnv = (): EmptyStateEnv | null => {
  if (typeof document === 'undefined') {
    return null;
  }

  const value = document.documentElement.dataset.env;
  return isEnv(value) ? value : null;
};

const illustrationByEnv: Record<EmptyStateEnv, ReactNode> = {
  hosted: (
    <span aria-hidden="true" style={{ color: 'var(--tt-cyan)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
      {'{ }'}
    </span>
  ),
  localhost: (
    <span aria-hidden="true" style={{ color: 'var(--tt-green)', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}>
      {'$'}
    </span>
  ),
};

const copyByEnv: Record<EmptyStateEnv, string> = {
  hosted: 'Import evals.json artifacts here; hosted never runs local commands.',
  localhost: 'Choose a workspace before running local eval commands.',
};

export const EmptyState = ({ title, body, action, env }: EmptyStateProps) => {
  const { env: contextEnv } = useEnv();
  const { activeSection } = useSection();
  const activeEnv = env ?? readDocumentEnv() ?? contextEnv;

  return (
    <section
      data-env={activeEnv}
      data-section={activeSection.name}
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        display: 'grid',
        gap: 'var(--tt-gap-4, 16px)',
        maxWidth: 560,
        padding: 20,
        width: '100%',
      }}
    >
      <div
        style={{
          alignItems: 'center',
          border: '1px solid var(--tt-border)',
          display: 'inline-flex',
          height: 42,
          justifyContent: 'center',
          justifySelf: 'start',
          width: 42,
        }}
      >
        {illustrationByEnv[activeEnv]}
      </div>
      <div style={{ display: 'grid', gap: 'var(--tt-gap-2, 8px)' }}>
        <h2 style={{ fontSize: 20, lineHeight: 1.2, margin: 0 }}>{title}</h2>
        <p style={{ color: 'var(--tt-fg-dark)', lineHeight: 1.5, margin: 0 }}>{body}</p>
        <p style={{ color: 'var(--tt-comment)', lineHeight: 1.5, margin: 0 }}>{copyByEnv[activeEnv]}</p>
      </div>
      {action ? (
        <button
          onClick={action.onClick}
          type="button"
          style={{
            background: 'var(--tt-selection)',
            border: '1px solid var(--tt-border-active)',
            color: 'var(--tt-fg)',
            cursor: 'pointer',
            justifySelf: 'start',
            padding: '8px 10px',
          }}
        >
          {action.label}
        </button>
      ) : null}
    </section>
  );
};
