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
    comment: '#a9b1d6',
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
    dim: '#8a93c4',
  },
  gruvbox: {
    bg: '#282828',
    bgDark: '#1d2021',
    bgHi: '#3c3836',
    fg: '#ebdbb2',
    fgDark: '#d5c4a1',
    comment: '#d5c4a1',
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
    dim: '#a89984',
  },
  nord: {
    bg: '#2e3440',
    bgDark: '#272c36',
    bgHi: '#3b4252',
    fg: '#d8dee9',
    fgDark: '#e5e9f0',
    comment: '#d8dee9',
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
    dim: '#94a1bd',
  },
} as const satisfies Themes;

export const defaultTheme = 'tokyonight' satisfies ThemeName;

/**
 * Theme-independent dimension tokens, per design.md §1.3–1.7.
 * The build script emits each group as `--tt-<group>-<key>` CSS custom
 * properties (numbers become px; strings pass through verbatim).
 * `space` is value-named: --tt-space-4 … --tt-space-32.
 */
export const dimensions = {
  text: {
    '2xl': 24,
    xl: 22,
    lg: 20,
    md: 17,
    base: 15,
    'body-lg': 14,
    body: 13,
    ui: 12.5,
    sm: 12,
    xs: 11.5,
    '2xs': 11,
    '3xs': 10,
  },
  space: [4, 6, 8, 10, 12, 14, 16, 20, 26, 32],
  radius: {
    sm: 5,
    md: 6,
    lg: 7,
    xl: 8,
    '2xl': 10,
  },
  tracking: {
    kicker: '0.05em',
    'kicker-wide': '0.08em',
  },
  leading: {
    body: 1.6,
    prose: 1.7,
    code: 1.9,
  },
  layout: {
    'header-h': 50,
    'statusbar-h': 25,
    // Fluid-desktop floor: panels flex to fill any width down to this, then the
    // shell scrolls horizontally. Below it the multi-rail layout gets too tight.
    'app-min-w': 860,
  },
} as const;

export type Dimensions = typeof dimensions;
export type TextStep = keyof Dimensions['text'];
export type RadiusStep = keyof Dimensions['radius'];
export type SpaceStep = Dimensions['space'][number];

export const fontFamilyMono =
  "'JetBrains Mono', ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";
