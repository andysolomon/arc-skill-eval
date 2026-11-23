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
  if (env.ARC_TUI_ASCII && env.ARC_TUI_ASCII !== '0') return false;
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
  arrowL: string;
  enter: string;
  shift: string;
  ctrl: string;
  play: string;
  sigma: string;
  compare: string;
  delta: string;
  bullet: string;
  spinner: string[];
}

const UNI: GlyphSet = {
  pass: '✓', fail: '✗', partial: '◐', running: '◌',
  barFull: '▓', barEmpty: '░', accent: '▌',
  up: '↑', down: '↓', arrowR: '→', arrowL: '←', enter: '↵', shift: '⇧', ctrl: '⌃',
  play: '▶', sigma: 'Σ', compare: '⇄', delta: 'Δ', bullet: '●',
  spinner: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
};

const ASCII: GlyphSet = {
  pass: '+', fail: 'x', partial: '~', running: '.',
  barFull: '#', barEmpty: '-', accent: '|',
  up: '^', down: 'v', arrowR: '->', arrowL: '<-', enter: 'ent', shift: 'shift+', ctrl: '^',
  play: '>', sigma: 'sum', compare: '<>', delta: 'd', bullet: '*',
  spinner: ['|', '/', '-', '\\'],
};

export const GLYPHS: GlyphSet = UNICODE ? UNI : ASCII;

/** Box border style: rounded Unicode corners, or `+-|` when glyphs fall back to ASCII. */
export const BORDER: 'round' | 'classic' = UNICODE ? 'round' : 'classic';

// One-character ASCII stand-ins, so column widths stay the same. Covers the
// glyphs the views, forms, and Ink's box borders write.
const ASCII_FALLBACK: Record<string, string> = {
  '╭': '+', '╮': '+', '╰': '+', '╯': '+', '┌': '+', '┐': '+', '└': '+', '┘': '+', '─': '-', '│': '|',
  '…': '.', '—': '-', '–': '-', '·': '.', '×': 'x', '≥': '>',
  '→': '>', '←': '<', '↑': '^', '↓': 'v', '↵': '>', '⇧': '^', '⌃': '^', '›': '>', '▶': '>', '⇄': '=',
  '✓': '+', '✗': 'x', '◌': '.', '◐': '~', '●': '*', '▓': '#', '░': '-', '▌': '|', 'Σ': 'S', 'Δ': 'd',
};
const ASCII_FALLBACK_RE = new RegExp(`[${Object.keys(ASCII_FALLBACK).join('')}\\u2800-\\u28ff]`, 'g');

/** Replace the UI's Unicode glyphs with ASCII. Other characters pass through. */
export function toAscii(text: string): string {
  return text.replace(ASCII_FALLBACK_RE, (ch) => ASCII_FALLBACK[ch] ?? '.');
}

/**
 * The stream Ink should render to. When glyphs fall back to ASCII, writes go
 * through toAscii, which catches the literal glyphs in every view and form,
 * not only the ones that read GLYPHS.
 */
export function renderStream(out: NodeJS.WriteStream): NodeJS.WriteStream {
  if (UNICODE) return out;
  return new Proxy(out, {
    get(target, prop) {
      if (prop === 'write') {
        return (chunk: unknown, ...rest: unknown[]) =>
          (target.write as (...args: unknown[]) => boolean)(typeof chunk === 'string' ? toAscii(chunk) : chunk, ...rest);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}
