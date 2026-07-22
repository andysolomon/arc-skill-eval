import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import type { ThemeName } from '@/types';
import { getPrefs, setPrefs, subscribePrefs } from '@/persistence/preferences';

type ThemeContextValue = {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
};

const legacyThemeStorageKey = 'arc-pi-theme';
let legacyThemeMigration: Promise<ThemeName | null> | null = null;

export const themeNames = ['tokyonight', 'gruvbox', 'nord'] as const satisfies readonly ThemeName[];
export const defaultTheme = 'tokyonight' satisfies ThemeName;

const isThemeName = (value: string | null): value is ThemeName =>
  value === 'tokyonight' || value === 'gruvbox' || value === 'nord';

const ThemeContext = createContext<ThemeContextValue | null>(null);

const migrateLegacyTheme = async (): Promise<ThemeName | null> => {
  if (legacyThemeMigration) {
    return legacyThemeMigration;
  }

  legacyThemeMigration = migrateLegacyThemeOnce();
  return legacyThemeMigration;
};

const migrateLegacyThemeOnce = async (): Promise<ThemeName | null> => {
  const legacyTheme = window.localStorage.getItem(legacyThemeStorageKey);

  if (!legacyTheme) {
    return null;
  }

  window.localStorage.removeItem(legacyThemeStorageKey);

  if (!isThemeName(legacyTheme)) {
    return null;
  }

  await setPrefs({ theme: legacyTheme });
  return legacyTheme;
};

export const ThemeProvider = ({ children }: PropsWithChildren) => {
  const [theme, setThemeState] = useState<ThemeName>(() => {
    const documentTheme = document.documentElement.dataset.theme ?? null;

    return isThemeName(documentTheme) ? documentTheme : defaultTheme;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const migratedTheme = await migrateLegacyTheme();
      const prefs = migratedTheme ? null : await getPrefs();

      if (!cancelled) {
        setThemeState(migratedTheme ?? prefs?.theme ?? defaultTheme);
        setHydrated(true);
      }
    };

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!hydrated) {
      return undefined;
    }

    void setPrefs({ theme });
    return subscribePrefs((prefs) => {
      setThemeState(prefs.theme);
    });
  }, [hydrated, theme]);

  const value = useMemo(
    () => ({ theme, setTheme: setThemeState }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return value;
};
