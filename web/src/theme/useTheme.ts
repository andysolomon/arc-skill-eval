import { useEffect, useState } from 'react';
import type { ThemeName } from '@/types';

export const themeNames = ['tokyonight', 'gruvbox', 'nord'] as const satisfies readonly ThemeName[];
export const defaultTheme = 'tokyonight' satisfies ThemeName;
const storageKey = 'arc-pi-theme';

const isThemeName = (value: string | null): value is ThemeName =>
  value === 'tokyonight' || value === 'gruvbox' || value === 'nord';

const readStoredTheme = (): ThemeName => {
  if (typeof window === 'undefined') {
    return defaultTheme;
  }

  const storedTheme = window.localStorage.getItem(storageKey);
  if (isThemeName(storedTheme)) {
    return storedTheme;
  }

  const documentTheme = document.documentElement.dataset.theme ?? null;
  return isThemeName(documentTheme) ? documentTheme : defaultTheme;
};

export const useThemeState = () => {
  const [theme, setTheme] = useState<ThemeName>(readStoredTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  return { theme, setTheme };
};
