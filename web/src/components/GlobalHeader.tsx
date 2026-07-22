import { useTheme } from '@/theme/ThemeProvider';
import { themeNames } from '@/theme/useTheme';
import type { ThemeName } from '@/types';

const themeLabels: Record<ThemeName, string> = {
  tokyonight: 'Tokyo',
  gruvbox: 'Gruvbox',
  nord: 'Nord',
};

export const GlobalHeader = () => {
  const { theme, setTheme } = useTheme();

  return (
    <header className="global-header" data-testid="global-header">
      <div className="brand-lockup">arc-skill-eval</div>
      <div className="theme-control" role="radiogroup" aria-label="Theme">
        {themeNames.map((themeName) => (
          <button
            aria-checked={theme === themeName}
            className="theme-control__option"
            data-active={theme === themeName}
            data-theme-option={themeName}
            key={themeName}
            onClick={() => setTheme(themeName)}
            role="radio"
            type="button"
          >
            {themeLabels[themeName]}
          </button>
        ))}
      </div>
    </header>
  );
};
