import { useEffect, useState } from 'react';
import { getPrefs, setPrefs } from '@/persistence/preferences';

type WorkspacePickerProps = {
  value: string;
  onChange: (workspaceRoot: string) => void;
};

export const readLastRunIdPreference = async (): Promise<string | undefined> => {
  const prefs = await getPrefs();
  return prefs.lastRunId;
};

export const writeLastRunIdPreference = async (lastRunId: string): Promise<void> => {
  await setPrefs({ lastRunId });
};

export const WorkspacePicker = ({ value, onChange }: WorkspacePickerProps) => {
  const [draft, setDraft] = useState(value);
  const [lastRunId, setLastRunId] = useState<string | undefined>();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    let cancelled = false;

    void readLastRunIdPreference().then((nextLastRunId) => {
      if (!cancelled) {
        setLastRunId(nextLastRunId);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const pickWorkspace = () => {
    const workspaceRoot = draft.trim();

    if (!workspaceRoot) {
      return;
    }

    if (window.confirm(`Use ${workspaceRoot} as the run workspace?`)) {
      onChange(workspaceRoot);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label
        style={{
          color: 'var(--tt-comment)',
          display: 'grid',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          gap: 6,
        }}
      >
        workspace root
        <input
          aria-label="Workspace root"
          onChange={(event) => setDraft(event.target.value)}
          placeholder="/path/to/skill"
          value={draft}
          style={{
            background: 'var(--tt-bg)',
            border: '1px solid var(--tt-border)',
            color: 'var(--tt-fg)',
            font: 'inherit',
            minHeight: 34,
            padding: '0 10px',
          }}
        />
      </label>
      <button
        onClick={pickWorkspace}
        type="button"
        style={{
          background: 'var(--tt-bg)',
          border: '1px solid var(--tt-green)',
          color: 'var(--tt-green)',
          cursor: 'pointer',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          minHeight: 34,
          padding: '0 10px',
          textAlign: 'left',
        }}
      >
        Pick workspace
      </button>
      <span
        aria-label="last run id"
        style={{
          color: 'var(--tt-fg-dark)',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontSize: 12,
          overflowWrap: 'anywhere',
        }}
      >
        last run: {lastRunId ?? 'none'}
      </span>
    </div>
  );
};
