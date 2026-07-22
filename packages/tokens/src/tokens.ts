export const themeNames = ['tokyonight', 'gruvbox', 'nord'] as const;

export type ThemeName = (typeof themeNames)[number];
export type HexColor = `#${string}`;

export const semanticRoles = {
  bg: 'Panel background',
  bgDark: 'Recessed background',
  bgHi: 'Unfocused selection background',
  fg: 'Primary text',
  fgDark: 'Secondary text',
  comment: 'Comments / chrome',
  blue: 'Accent / focus',
  cyan: 'Active filter',
  green: 'Pass / success',
  magenta: 'Sort indicator',
  red: 'Fail / error',
  orange: 'Partial / warning',
  yellow: 'Keys / prompt',
  teal: 'Accent',
  selection: 'Focused selection background',
  border: 'Panel border',
  borderActive: 'Panel border focused',
  dim: 'Empty bar cells / chrome',
} as const;

export type SemanticRole = keyof typeof semanticRoles;
export type ThemePalette = Readonly<Record<SemanticRole, HexColor>>;
export type Themes = Readonly<Record<ThemeName, ThemePalette>>;
export type TailwindTokenName = `--tt-${SemanticRole}`;

export const themes = {
  tokyonight: {
    bg: '#1a1b26',
    bgDark: '#16161e',
    bgHi: '#222538',
    fg: '#c0caf5',
    fgDark: '#a9b1d6',
    comment: '#565f89',
    blue: '#7aa2f7',
    cyan: '#7dcfff',
    green: '#9ece6a',
    magenta: '#bb9af7',
    red: '#f7768e',
    orange: '#ff9e64',
    yellow: '#e0af68',
    teal: '#73daca',
    selection: '#283457',
    border: '#2a2e42',
    borderActive: '#7aa2f7',
    dim: '#3b4261',
  },
  gruvbox: {
    bg: '#282828',
    bgDark: '#1d2021',
    bgHi: '#3c3836',
    fg: '#ebdbb2',
    fgDark: '#d5c4a1',
    comment: '#928374',
    blue: '#83a598',
    cyan: '#8ec07c',
    green: '#b8bb26',
    magenta: '#d3869b',
    red: '#fb4934',
    orange: '#fe8019',
    yellow: '#fabd2f',
    teal: '#8ec07c',
    selection: '#504945',
    border: '#3c3836',
    borderActive: '#fabd2f',
    dim: '#665c54',
  },
  nord: {
    bg: '#2e3440',
    bgDark: '#272c36',
    bgHi: '#3b4252',
    fg: '#d8dee9',
    fgDark: '#e5e9f0',
    comment: '#4c566a',
    blue: '#81a1c1',
    cyan: '#88c0d0',
    green: '#a3be8c',
    magenta: '#b48ead',
    red: '#bf616a',
    orange: '#d08770',
    yellow: '#ebcb8b',
    teal: '#8fbcbb',
    selection: '#434c5e',
    border: '#3b4252',
    borderActive: '#88c0d0',
    dim: '#4c566a',
  },
} as const satisfies Themes;

export const defaultTheme = 'tokyonight' satisfies ThemeName;
