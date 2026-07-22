import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { getPrefs, setPrefs, subscribePrefs, type EnvName } from '@/persistence/preferences';

type EnvContextValue = {
  env: EnvName;
  setEnv: (env: EnvName) => void;
};

const EnvContext = createContext<EnvContextValue | null>(null);

const isEnvName = (value: string | null): value is EnvName =>
  value === 'hosted' || value === 'localhost';

const readDefaultEnv = (): EnvName => {
  const datasetEnv = document.documentElement.dataset.env ?? null;

  if (isEnvName(datasetEnv)) {
    return datasetEnv;
  }

  return 'hosted';
};

export const EnvProvider = ({ children }: PropsWithChildren) => {
  const [env, setEnvState] = useState<EnvName>(readDefaultEnv);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void getPrefs().then((prefs) => {
      if (!cancelled) {
        setEnvState(prefs.env);
        setHydrated(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.env = env;
  }, [env]);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

    void setPrefs({ env });
    return subscribePrefs((prefs) => {
      setEnvState(prefs.env);
    });
  }, [env, hydrated]);

  const value = useMemo(() => ({ env, setEnv: setEnvState }), [env]);

  return <EnvContext.Provider value={value}>{children}</EnvContext.Provider>;
};

export const useEnv = () => {
  const value = useContext(EnvContext);

  if (!value) {
    throw new Error('useEnv must be used within EnvProvider');
  }

  return value;
};
