import { useMemo, useState } from 'react';
import { Diff } from './tabs/Diff';
import { Overview } from './tabs/Overview';
import { Raw } from './tabs/Raw';
import { Response } from './tabs/Response';
import { Trace } from './tabs/Trace';
import type { BrowseCase, BrowseRun, BrowseTab, BrowseVariant } from './useBrowseData';

type BrowseDetailProps = {
  run: BrowseRun;
  testCase: BrowseCase;
  workspaceRoot: string;
};

const tabs: { id: BrowseTab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'response', label: 'Response' },
  { id: 'diff', label: 'Diff' },
  { id: 'trace', label: 'Trace' },
  { id: 'raw', label: 'Raw' },
];

const variants: BrowseVariant[] = ['with_skill', 'without_skill'];

export const BrowseDetail = ({ run, testCase, workspaceRoot }: BrowseDetailProps) => {
  const [activeTab, setActiveTab] = useState<BrowseTab>('overview');
  const [variant, setVariant] = useState<BrowseVariant>('with_skill');
  const activeSurface = useMemo(() => {
    if (activeTab === 'response') {
      return <Response run={run} testCase={testCase} variant={variant} workspaceRoot={workspaceRoot} />;
    }

    if (activeTab === 'diff') {
      return <Diff run={run} testCase={testCase} variant={variant} workspaceRoot={workspaceRoot} />;
    }

    if (activeTab === 'trace') {
      return <Trace run={run} testCase={testCase} variant={variant} workspaceRoot={workspaceRoot} />;
    }

    if (activeTab === 'raw') {
      return <Raw run={run} testCase={testCase} variant={variant} workspaceRoot={workspaceRoot} />;
    }

    return <Overview run={run} testCase={testCase} variant={variant} workspaceRoot={workspaceRoot} />;
  }, [activeTab, run, testCase, variant, workspaceRoot]);

  return (
    <section
      aria-label="Selected case details"
      style={{
        border: '1px solid var(--tt-border-active)',
        borderRadius: 8,
        display: 'flex',
        flex: 1,
        flexDirection: 'column',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <header
        style={{
          alignItems: 'center',
          background: 'var(--tt-bg-dark)',
          borderBottom: '1px solid var(--tt-border)',
          display: 'flex',
          gap: 12,
          padding: '7px 16px',
        }}
      >
        <h1
          style={{
            color: 'var(--tt-fg)',
            fontSize: 14,
            fontWeight: 700,
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {testCase.id}
        </h1>
        {run.compare ? (
          <div
            aria-label="variant switch"
            style={{ display: 'inline-flex', gap: 4 }}
          >
            {variants.map((nextVariant) => (
              <button
                data-active={variant === nextVariant}
                key={nextVariant}
                onClick={() => setVariant(nextVariant)}
                type="button"
                style={{
                  background: variant === nextVariant ? 'var(--tt-selection)' : 'transparent',
                  border: 0,
                  borderRadius: 5,
                  color:
                    variant === nextVariant
                      ? nextVariant === 'with_skill'
                        ? 'var(--tt-green)'
                        : 'var(--tt-orange)'
                      : 'var(--tt-comment)',
                  cursor: 'pointer',
                  fontSize: 11,
                  padding: '3px 8px',
                }}
              >
                {nextVariant}
              </button>
            ))}
          </div>
        ) : null}
        <span style={{ flex: 1 }} />
        <nav aria-label="Case detail tabs" style={{ display: 'flex', gap: 14 }}>
          {tabs.map((tab) => (
            <button
              aria-current={activeTab === tab.id ? 'page' : undefined}
              data-active={activeTab === tab.id}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
              style={{
                background: 'transparent',
                border: 0,
                color: activeTab === tab.id ? 'var(--tt-blue)' : 'var(--tt-comment)',
                cursor: 'pointer',
                fontSize: 12,
                fontWeight: activeTab === tab.id ? 700 : 400,
                padding: 0,
              }}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>
      <div
        style={{
          flex: 1,
          lineHeight: 1.55,
          minHeight: 0,
          minWidth: 0,
          overflow: 'auto',
          padding: '16px 20px',
        }}
      >
        {activeSurface}
      </div>
    </section>
  );
};
