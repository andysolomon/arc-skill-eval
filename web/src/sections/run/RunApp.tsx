import { useState } from 'react';
import { useEnv } from '@/state/env';
import { RunLifecycleProvider } from '@/state/runLifecycle';
import { RunComposerLocalhost, defaultRunComposerState } from './RunComposer.localhost';
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
      style={
        isLocalhost
          ? { display: 'flex', gap: 14, minHeight: 0, minWidth: 0, padding: 16 }
          : {
              alignItems: 'center',
              display: 'flex',
              justifyContent: 'center',
              minHeight: 0,
              minWidth: 0,
              padding: 40,
            }
      }
    >
      <RunLifecycleProvider>
        {isLocalhost ? (
          <>
            <RunComposerLocalhost value={composerState} onChange={setComposerState} />
            <RunConsoleLocalhost composerState={composerState} />
          </>
        ) : (
          <RunEmptyState />
        )}
      </RunLifecycleProvider>
    </main>
  );
};
