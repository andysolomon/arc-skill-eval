import { StrictMode, useEffect, useState, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { subscribeHostedDataReset } from './persistence/db';
import { EnvProvider } from './state/env';
import { SectionProvider } from './state/section';
import { ThemeProvider } from './state/theme';
import { WorkspaceProvider } from './state/workspace';
import './styles.css';

const Providers = ({ children }: PropsWithChildren) => {
  const [resetKey, setResetKey] = useState(0);

  useEffect(
    () => subscribeHostedDataReset(() => setResetKey((value) => value + 1)),
    [],
  );

  return (
    <ThemeProvider key={`theme-${resetKey}`}>
      <SectionProvider key={`section-${resetKey}`}>
        <EnvProvider key={`env-${resetKey}`}>
          <WorkspaceProvider key={`workspace-${resetKey}`}>{children}</WorkspaceProvider>
        </EnvProvider>
      </SectionProvider>
    </ThemeProvider>
  );
};

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Providers>
      <App />
    </Providers>
  </StrictMode>,
);
