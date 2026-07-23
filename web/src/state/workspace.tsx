import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { getPrefs, setPrefs } from '@/persistence/preferences';

export const defaultWorkspaceFavorites = [
  '~/dev/arc-skills',
  '~/work/agent-skills',
  '~/src/skills',
];

export const workspaceSkills: Array<{ id: string; role: 'target' | 'distractor' }> = [
  { id: 'arc-conventional-commits', role: 'target' },
  { id: 'arc-creating-evals', role: 'target' },
  { id: 'release-please', role: 'distractor' },
];

type WorkspaceContextValue = {
  workspace: string;
  favorites: string[];
  setWorkspace: (path: string) => void;
  pickWorkspace: (path: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export const WorkspaceProvider = ({ children }: PropsWithChildren) => {
  const [workspace, setWorkspaceState] = useState(defaultWorkspaceFavorites[0]);
  const [favorites, setFavorites] = useState<string[]>(defaultWorkspaceFavorites);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getPrefs()
      .then((prefs) => {
        if (cancelled) {
          return;
        }

        if (prefs.workspaceFavorites.length > 0) {
          setFavorites(prefs.workspaceFavorites);
        }
        if (prefs.workspaceRoot) {
          setWorkspaceState(prefs.workspaceRoot);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) {
          setHydrated(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const setWorkspace = useCallback(
    (path: string) => {
      setWorkspaceState(path);
      if (hydrated) {
        void setPrefs({ workspaceRoot: path }).catch(() => undefined);
      }
    },
    [hydrated],
  );

  const pickWorkspace = useCallback(
    (path: string) => {
      setWorkspaceState(path);
      setFavorites((current) => {
        const next = current.includes(path) ? current : [path, ...current];
        if (hydrated) {
          void setPrefs({ workspaceRoot: path, workspaceFavorites: next }).catch(() => undefined);
        }
        return next;
      });
    },
    [hydrated],
  );

  const value = useMemo(
    () => ({ workspace, favorites, setWorkspace, pickWorkspace }),
    [workspace, favorites, setWorkspace, pickWorkspace],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
};

export const useWorkspace = () => {
  const value = useContext(WorkspaceContext);

  if (!value) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }

  return value;
};
