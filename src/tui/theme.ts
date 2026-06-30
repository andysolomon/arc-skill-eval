// Tokyo Night palette + pure render helpers.
// Ported verbatim from the HTML design spec (style.md §2.1). No Ink/React here —
// these functions build plain {text,color} segments the components render.

export const COLORS = {
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

export type Color = string;

/** One run of colored text inside a line/row. */
export interface Seg {
  t: string;
  c: Color;
  b?: boolean; // bold
}

/** A line in the main pane (optionally with a full-width background wash). */
export interface Line {
  segs: Seg[];
  bg?: Color;
}

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

/** A filled/empty block-bar, e.g. ▓▓▓▓░░░░░░ — gate the glyphs behind a unicode check in prod. */
export function bar(frac: number, color: Color, width = 18): Seg[] {
  const clamped = Math.max(0, Math.min(1, frac));
  const f = Math.round(clamped * width);
  return [seg('▓'.repeat(f), color), seg('░'.repeat(width - f), COLORS.dim)];
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

export const glyphs = { pass: '✓', fail: '✗', partial: '◐', running: '◌' } as const;

export function statusGlyph(status: string): [string, Color] {
  switch (status) {
    case 'pass': return [glyphs.pass, COLORS.green];
    case 'fail': return [glyphs.fail, COLORS.red];
    case 'partial': return [glyphs.partial, COLORS.orange];
    default: return [glyphs.running, COLORS.comment];
  }
}

export const rateColor = (p: number, t: number): Color => (p >= t ? COLORS.green : p <= 0 ? COLORS.red : COLORS.orange);

export const deltaColor = (d: string): Color =>
  d && d[0] === '+' && d !== '+0.0%' ? COLORS.green : d && d[0] === '-' ? COLORS.red : COLORS.comment;

export function passFrac(s: string): [number, number] {
  const parts = s.split('/');
  return [Number(parts[0]) || 0, Number(parts[1]) || 0];
}
