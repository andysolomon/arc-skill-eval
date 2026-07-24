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

// No pre-baked sample favorites — favorites are only directories the user has
// actually referenced, and stale ones are pruned against the daemon on load.
export const defaultWorkspaceFavorites: string[] = [];

export type WorkspaceSkill = {
  id: string;
  role?: 'target' | 'distractor';
  name?: string;
  description?: string;
  path?: string;
  hasEvals?: boolean;
};

/** Fallback shown when the daemon is not running (hosted, or `npm run dev:web-only`). */
export const workspaceSkills: WorkspaceSkill[] = [
  { id: 'arc-conventional-commits', role: 'target', hasEvals: true },
  { id: 'arc-creating-evals', role: 'target', hasEvals: true },
  { id: 'release-please', role: 'distractor' },
];

export type WorkspaceSkillsStatus = 'loading' | 'live' | 'offline';

type WorkspaceContextValue = {
  workspace: string;
  favorites: string[];
  /** Skills the daemon found under the referenced directory (fallback list when offline). */
  skills: WorkspaceSkill[];
  skillsStatus: WorkspaceSkillsStatus;
  /** Absolute path the daemon resolved the reference to (undefined while offline). */
  resolvedPath?: string;
  /** 'github' when the reference is a cloned repo. */
  source?: 'local' | 'github';
  workspaceError?: string;
  setWorkspace: (path: string) => void;
  pickWorkspace: (path: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const DAEMON_WORKSPACE_URL = 'http://localhost:7357/workspace';

type WorkspaceResolution = {
  skills: WorkspaceSkill[];
  status: WorkspaceSkillsStatus;
  resolvedPath?: string;
  source?: 'local' | 'github';
  error?: string;
};

const offlineResolution: WorkspaceResolution = {
  skills: workspaceSkills,
  status: 'offline',
};

const asWorkspaceSkill = (value: unknown): WorkspaceSkill | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string') {
    return null;
  }

  return {
    id: record.id,
    name: typeof record.name === 'string' ? record.name : undefined,
    description: typeof record.description === 'string' ? record.description : undefined,
    path: typeof record.path === 'string' ? record.path : undefined,
    hasEvals: record.hasEvals === true,
  };
};

const fetchWorkspace = async (root: string, signal: AbortSignal): Promise<WorkspaceResolution> => {
  const response = await fetch(`${DAEMON_WORKSPACE_URL}?root=${encodeURIComponent(root)}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`workspace lookup failed with ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const skills = Array.isArray(payload.skills)
    ? payload.skills.map(asWorkspaceSkill).filter((skill): skill is WorkspaceSkill => !!skill)
    : [];

  return {
    skills,
    status: 'live',
    resolvedPath: typeof payload.resolvedPath === 'string' ? payload.resolvedPath : undefined,
    source: payload.source === 'github' ? 'github' : 'local',
    error: typeof payload.error === 'string' ? payload.error : undefined,
  };
};

export const WorkspaceProvider = ({ children }: PropsWithChildren) => {
  const [workspace, setWorkspaceState] = useState('');
  const [favorites, setFavorites] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [resolution, setResolution] = useState<WorkspaceResolution>({
    skills: workspaceSkills,
    status: 'loading',
  });

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

  // Prune favorites that no longer resolve to a real directory (e.g. removed
  // dirs or previously persisted sample paths). When the daemon is unreachable
  // we can't verify, so we leave the list untouched.
  useEffect(() => {
    if (!hydrated || favorites.length === 0) {
      return undefined;
    }

    const controller = new AbortController();

    void Promise.all(
      favorites.map(async (favorite) => {
        try {
          const response = await fetch(
            `http://localhost:7357/fs?path=${encodeURIComponent(favorite)}`,
            { signal: controller.signal },
          );
          const data = (await response.json()) as { ok?: boolean };
          return { favorite, exists: data.ok === true };
        } catch {
          return { favorite, exists: true };
        }
      }),
    )
      .then((results) => {
        if (controller.signal.aborted) {
          return;
        }

        const kept = results.filter((result) => result.exists).map((result) => result.favorite);
        if (kept.length !== favorites.length) {
          setFavorites(kept);
          void setPrefs({ workspaceFavorites: kept }).catch(() => undefined);
        }
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [favorites, hydrated]);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

    if (!workspace) {
      setResolution({ skills: [], status: 'offline' });
      return undefined;
    }

    const controller = new AbortController();
    setResolution((current) => ({ ...current, status: 'loading' }));

    fetchWorkspace(workspace, controller.signal)
      .then((next) => setResolution(next))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResolution(offlineResolution);
        }
        return error;
      });

    return () => {
      controller.abort();
    };
  }, [hydrated, workspace]);

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
    () => ({
      workspace,
      favorites,
      skills: resolution.skills,
      skillsStatus: resolution.status,
      resolvedPath: resolution.resolvedPath,
      source: resolution.source,
      workspaceError: resolution.error,
      setWorkspace,
      pickWorkspace,
    }),
    [workspace, favorites, resolution, setWorkspace, pickWorkspace],
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
