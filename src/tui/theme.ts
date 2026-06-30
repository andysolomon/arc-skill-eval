// Tokyo Night palette + pure render helpers.
// The palette degrades on low-color terminals (caps.colorLevel) and the
// glyph set degrades to ASCII off UTF-8 (caps.GLYPHS). All call sites import
// COLORS / GLYPHS unchanged — the runtime swap happens here.

import { colorLevel, GLYPHS } from './caps.js';

const HEX = {
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
} as const;

// 16-color fallback (Ink/chalk auto-downsamples hex on 256-color, so this is
// only used at level <= 1). Keys mirror HEX exactly.
const ANSI: Record<keyof typeof HEX, string> = {
  bg: 'black',
  bgDark: 'black',
  bgHi: 'gray',
  fg: 'white',
  fgDark: 'white',
  comment: 'gray',
  blue: 'blueBright',
  cyan: 'cyanBright',
  green: 'greenBright',
  magenta: 'magentaBright',
  red: 'redBright',
  orange: 'yellow',
  yellow: 'yellowBright',
  teal: 'cyan',
  selection: 'blue',
  border: 'gray',
  borderActive: 'blueBright',
  dim: 'gray',
};

type Palette = Record<keyof typeof HEX, string>;

// Alternate palettes from style.md (selectable via ARC_TUI_THEME).
const GRUVBOX: Palette = {
  bg: '#282828', bgDark: '#1d2021', bgHi: '#3c3836', fg: '#ebdbb2', fgDark: '#d5c4a1',
  comment: '#928374', blue: '#83a598', cyan: '#8ec07c', green: '#b8bb26', magenta: '#d3869b',
  red: '#fb4934', orange: '#fe8019', yellow: '#fabd2f', teal: '#8ec07c',
  selection: '#504945', border: '#3c3836', borderActive: '#fabd2f', dim: '#665c54',
};
const NORD: Palette = {
  bg: '#2e3440', bgDark: '#272c36', bgHi: '#3b4252', fg: '#d8dee9', fgDark: '#e5e9f0',
  comment: '#4c566a', blue: '#81a1c1', cyan: '#88c0d0', green: '#a3be8c', magenta: '#b48ead',
  red: '#bf616a', orange: '#d08770', yellow: '#ebcb8b', teal: '#8fbcbb',
  selection: '#434c5e', border: '#3b4252', borderActive: '#88c0d0', dim: '#4c566a',
};

const PALETTES: Record<string, Palette> = { tokyonight: { ...HEX }, gruvbox: GRUVBOX, nord: NORD };
const THEME = (process.env.ARC_TUI_THEME || 'tokyonight').toLowerCase();
const PICKED: Palette = PALETTES[THEME] ?? { ...HEX };

export type Color = string;
export const COLORS: Palette = colorLevel >= 2 ? PICKED : ANSI;

export interface Seg { t: string; c: Color; b?: boolean }
export interface Line { segs: Seg[]; bg?: Color }

export const seg = (t: unknown, c: Color, b = false): Seg => ({ t: String(t), c, ...(b ? { b: true } : {}) });

export const pad = (s: unknown, w: number): string => {
  const x = String(s);
  return x + ' '.repeat(Math.max(0, w - x.length));
};

export const trunc = (s: unknown, n: number): string => {
  const x = String(s);
  return x.length > n ? x.slice(0, n - 1) + '…' : x;
};

export const num = (n: number): string => Number(n).toLocaleString('en-US');

export const segLen = (segs: Seg[]): number => segs.reduce((a, s) => a + s.t.length, 0);

/** A filled/empty block-bar — glyphs come from the capability-aware set. */
export function bar(frac: number, color: Color, width = 18): Seg[] {
  const clamped = Math.max(0, Math.min(1, frac));
  const f = Math.round(clamped * width);
  return [seg(GLYPHS.barFull.repeat(f), color), seg(GLYPHS.barEmpty.repeat(width - f), COLORS.dim)];
}

/** Word-wrap prose into indented main-pane lines. */
export function wrap(text: string, w: number, indent = '  '): Line[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const out: Line[] = [];
  let line = indent;
  for (const word of words) {
    if (line !== indent && (line + ' ' + word).length > w) {
      out.push({ segs: [seg(line, COLORS.fg)] });
      line = indent + word;
    } else {
      line = line === indent ? indent + word : line + ' ' + word;
    }
  }
  if (line.trim()) out.push({ segs: [seg(line, COLORS.fg)] });
  return out.length ? out : [{ segs: [seg(indent + '—', COLORS.dim)] }];
}

export function statusGlyph(status: string): [string, Color] {
  switch (status) {
    case 'pass': return [GLYPHS.pass, COLORS.green];
    case 'fail': return [GLYPHS.fail, COLORS.red];
    case 'partial': return [GLYPHS.partial, COLORS.orange];
    default: return [GLYPHS.running, COLORS.comment];
  }
}

export const rateColor = (p: number, t: number): Color => (p >= t ? COLORS.green : p <= 0 ? COLORS.red : COLORS.orange);

export const deltaColor = (d: string): Color =>
  d && d[0] === '+' && d !== '+0.0%' ? COLORS.green : d && d[0] === '-' ? COLORS.red : COLORS.comment;

export function passFrac(s: string): [number, number] {
  const parts = s.split('/');
  return [Number(parts[0]) || 0, Number(parts[1]) || 0];
}
