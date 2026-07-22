import { useState } from 'react';
import { useEnv } from '@/state/env';
import { RunLifecycleProvider } from '@/state/runLifecycle';
import { RunComposerHosted } from './RunComposer.hosted';
import { RunComposerLocalhost, defaultRunComposerState } from './RunComposer.localhost';
import { RunConsoleHosted } from './RunConsole.hosted';
import { RunConsoleLocalhost } from './RunConsole.localhost';
import { RunEmptyState } from './RunEmptyState';

export const RunApp = () => {
  const { env } = useEnv();
  const [composerState, setComposerState] = useState(defaultRunComposerState);
  const isLocalhost = env === 'localhost';

  return (
    <main
      className="app-main"
      data-env={env}
      data-screen-label={`run (${env})`}
      data-testid="run-app"
      style={{ minWidth: 0, overflow: 'auto', padding: 16 }}
    >
      <RunLifecycleProvider>
        <section
          aria-label="Run workspace"
          style={{
            display: 'grid',
            gap: 14,
            gridTemplateColumns: '392px minmax(0, 1fr)',
            minHeight: 'calc(100vh - 116px)',
            minWidth: 860,
          }}
        >
          {isLocalhost ? (
            <>
              <RunComposerLocalhost value={composerState} onChange={setComposerState} />
              <RunConsoleLocalhost composerState={composerState} />
            </>
          ) : (
            <>
              <RunComposerHosted />
              <RunConsoleHosted />
            </>
          )}
        </section>
      </RunLifecycleProvider>
      <section
        aria-label="Run hosted empty state"
        style={{
          display: 'grid',
          justifyItems: 'center',
          marginTop: 14,
        }}
      >
        <RunEmptyState />
      </section>
    </main>
  );
};
