// Terminal capability detection: color depth + unicode. Chooses the palette
// and glyph set the rest of the UI imports. Truecolor hex degrades to named
// ANSI colors on 16-color terminals (Ink/chalk auto-downsamples on 256-color),
// and block/box glyphs fall back to ASCII when the locale isn't UTF-8.
//
// Overrides: FORCE_COLOR=0 / NO_COLOR disable color; ARC_TUI_ASCII=1 forces ASCII glyphs.

function detectColorLevel(): number {
  // 3 = truecolor (16m) · 2 = 256 · 1 = 16 · 0 = none
  const env = process.env;
  if (env.FORCE_COLOR === '0' || env.NO_COLOR) return 0;
  if (env.COLORTERM && /(truecolor|24bit)/i.test(env.COLORTERM)) return 3;
  const stream = process.stdout as NodeJS.WriteStream & { getColorDepth?: (env?: object) => number };
  const depth = typeof stream.getColorDepth === 'function' ? stream.getColorDepth() : 8;
  if (depth >= 24) return 3;
  if (depth >= 8) return 2;
  if (depth >= 4) return 1;
  return 0;
}

function detectUnicode(): boolean {
  const env = process.env;
  if (env.ARC_TUI_ASCII) return false;
  if (env.WT_SESSION || env.TERM_PROGRAM === 'vscode' || env.TERM_PROGRAM === 'iTerm.app' || env.TERM_PROGRAM === 'Apple_Terminal') return true;
  const locale = (env.LC_ALL || env.LC_CTYPE || env.LANG || '').toLowerCase();
  if (/utf-?8/.test(locale)) return true;
  return process.platform === 'darwin';
}

export const colorLevel: number = detectColorLevel();
export const UNICODE: boolean = detectUnicode();

export interface GlyphSet {
  pass: string;
  fail: string;
  partial: string;
  running: string;
  barFull: string;
  barEmpty: string;
  accent: string;
  up: string;
  down: string;
  arrowR: string;
  compare: string;
  delta: string;
  bullet: string;
}

const UNI: GlyphSet = {
  pass: '✓', fail: '✗', partial: '◐', running: '◌',
  barFull: '▓', barEmpty: '░', accent: '▌',
  up: '↑', down: '↓', arrowR: '→', compare: '⇄', delta: 'Δ', bullet: '●',
};

const ASCII: GlyphSet = {
  pass: '+', fail: 'x', partial: '~', running: '.',
  barFull: '#', barEmpty: '-', accent: '|',
  up: '^', down: 'v', arrowR: '->', compare: '<>', delta: 'd', bullet: '*',
};

export const GLYPHS: GlyphSet = UNICODE ? UNI : ASCII;
