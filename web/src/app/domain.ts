import { Schema } from 'effect';

export const themeNames = ['tokyonight', 'gruvbox', 'nord'] as const;
export const ThemeName = Schema.Literals(themeNames);
export type ThemeName = typeof ThemeName.Type;
export const defaultTheme: ThemeName = 'tokyonight';

export const envNames = ['hosted', 'localhost'] as const;
export const EnvName = Schema.Literals(envNames);
export type EnvName = typeof EnvName.Type;

export const sectionNames = ['run', 'browse', 'create', 'review', 'learn'] as const;
export const SectionName = Schema.Literals(sectionNames);
export type SectionName = typeof SectionName.Type;

export type Section = Readonly<{ index: number; name: SectionName; label: string }>;

export const sections: ReadonlyArray<Section> = [
  { index: 1, name: 'run', label: 'run' },
  { index: 2, name: 'browse', label: 'browse' },
  { index: 3, name: 'create', label: 'create' },
  { index: 4, name: 'review', label: 'review' },
  { index: 5, name: 'learn', label: 'learn' },
];

export const isThemeName = (value: unknown): value is ThemeName =>
  typeof value === 'string' && (themeNames as ReadonlyArray<string>).includes(value);

export const isEnvName = (value: unknown): value is EnvName =>
  typeof value === 'string' && (envNames as ReadonlyArray<string>).includes(value);

export const isSectionName = (value: unknown): value is SectionName =>
  typeof value === 'string' && (sectionNames as ReadonlyArray<string>).includes(value);
