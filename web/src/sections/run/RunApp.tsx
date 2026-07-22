import { useEnv } from '@/state/env';
import { RunComposer } from './RunComposer';
import { RunConsole } from './RunConsole';
import { RunEmptyState } from './RunEmptyState';

export const RunApp = () => {
  const { env } = useEnv();

  return (
    <main
      className="app-main"
      data-screen-label={`run (${env})`}
      data-testid="run-app"
      style={{ minWidth: 0, overflow: 'auto', padding: 16 }}
    >
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
        <RunComposer />
        <RunConsole />
      </section>
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
