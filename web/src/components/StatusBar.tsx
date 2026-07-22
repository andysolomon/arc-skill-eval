import { resetHostedData } from '@/persistence/db';
import { useEnv } from '@/state/env';

export const StatusBar = () => {
  const { env } = useEnv();

  const handleReset = () => {
    if (!window.confirm('Reset hosted data?')) {
      return;
    }

    void resetHostedData();
  };

  return (
    <footer className="status-bar" data-testid="status-bar">
      <span className="status-bar__indicator" aria-hidden="true" />
      <span>localhost:5173</span>
      <span className="status-bar__spacer" />
      <span>env {env}</span>
      <button className="status-bar__reset" onClick={handleReset} type="button">
        Reset hosted data
      </button>
    </footer>
  );
};
