import { useMemo, useState } from 'react';
import { Column, Kicker } from '@/components/primitives';
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
      aria-label="Detail Pane"
      style={{
        background: 'var(--tt-bg-dark)',
        border: '1px solid var(--tt-border)',
        color: 'var(--tt-fg)',
        minHeight: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <Column gap={4}>
        <header
          style={{
            borderBottom: '1px solid var(--tt-border)',
            display: 'grid',
            gap: 12,
            padding: 14,
          }}
        >
          <div style={{ alignItems: 'start', display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <div style={{ display: 'grid', gap: 6, minWidth: 0 }}>
              <Kicker>detail pane</Kicker>
              <h1
                style={{
                  fontSize: 22,
                  lineHeight: 1.15,
                  margin: 0,
                  overflowWrap: 'anywhere',
                }}
              >
                {testCase.id}
              </h1>
            </div>
            <span
              style={{
                border: '1px solid var(--tt-border)',
                color: 'var(--tt-comment)',
                flex: '0 0 auto',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                fontSize: 11,
                padding: '4px 7px',
              }}
            >
              {run.id}
            </span>
          </div>

          {run.compare ? (
            <div aria-label="variant switch" style={{ display: 'inline-flex', justifySelf: 'start' }}>
              {variants.map((nextVariant) => (
                <button
                  data-active={variant === nextVariant}
                  key={nextVariant}
                  onClick={() => setVariant(nextVariant)}
                  type="button"
                  style={{
                    background: variant === nextVariant ? 'var(--tt-selection)' : 'var(--tt-bg)',
                    border: '1px solid var(--tt-border)',
                    color: variant === nextVariant ? 'var(--tt-fg)' : 'var(--tt-fg-dark)',
                    cursor: 'pointer',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                    fontSize: 12,
                    padding: '7px 10px',
                  }}
                >
                  {nextVariant}
                </button>
              ))}
            </div>
          ) : null}

          <nav aria-label="Mode Tabs" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {tabs.map((tab) => (
              <button
                aria-current={activeTab === tab.id ? 'page' : undefined}
                data-active={activeTab === tab.id}
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                type="button"
                style={{
                  background: activeTab === tab.id ? 'var(--tt-selection)' : 'var(--tt-bg)',
                  border: '1px solid var(--tt-border)',
                  color: activeTab === tab.id ? 'var(--tt-cyan)' : 'var(--tt-fg-dark)',
                  cursor: 'pointer',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  fontSize: 12,
                  fontWeight: activeTab === tab.id ? 700 : 400,
                  padding: '7px 9px',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </header>
        <div style={{ minHeight: 0, minWidth: 0, overflow: 'auto', padding: 14 }}>{activeSurface}</div>
      </Column>
    </section>
  );
};
