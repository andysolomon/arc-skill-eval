// Conformance tests for the TUI design tokens + pure render helpers.
//
// The interactive reference is the TUI Component Gallery (a DC export, mirrored
// at docs-site/public/component-gallery.html and documented in
// docs-site/.../components.md + src/tui/STYLE.md). The gallery is the *human*
// spec; these snapshots are the *machine* guard that the Ink code stays true to
// it — palette tokens, the unicode/ASCII glyph sets, and the bar/status helpers
// are all pinned here so a drift in theme.ts / caps.ts fails loudly.

import assert from 'node:assert/strict';
import test from 'node:test';

import { PALETTES, bar, statusGlyph, deltaColor, rateColor, passFrac, segLen, trunc } from '../dist/tui/theme.js';
import { GLYPH_SETS, GLYPHS } from '../dist/tui/caps.js';

const TOKEN_KEYS = [
  'bg', 'bgDark', 'bgHi', 'fg', 'fgDark', 'comment', 'blue', 'cyan', 'green',
  'magenta', 'red', 'orange', 'yellow', 'teal', 'selection', 'border', 'borderActive', 'dim',
];

const GLYPH_KEYS = [
  'pass', 'fail', 'partial', 'running', 'barFull', 'barEmpty', 'accent', 'up', 'down',
  'arrowR', 'arrowL', 'enter', 'shift', 'ctrl', 'play', 'sigma', 'compare', 'delta', 'bullet',
];

// ---------------------------------------------------------------- palettes

test('every theme defines the full token set with valid hex values', () => {
  const themes = Object.keys(PALETTES);
  assert.deepEqual(themes.sort(), ['gruvbox', 'nord', 'tokyonight']);
  for (const name of themes) {
    const palette = PALETTES[name];
    assert.deepEqual(Object.keys(palette).sort(), [...TOKEN_KEYS].sort(), `${name} token keys`);
    for (const key of TOKEN_KEYS) {
      assert.match(palette[key], /^#[0-9a-f]{6}$/i, `${name}.${key} should be a 6-digit hex`);
    }
  }
});

// Pin the exact palette tokens. This intentionally duplicates theme.ts so that
// any token change is a deliberate, reviewed edit kept in sync with the gallery.
test('palette tokens match the gallery spec (tokyonight default)', () => {
  assert.deepEqual(PALETTES.tokyonight, {
    bg: '#1a1b26', bgDark: '#16161e', bgHi: '#222538', fg: '#c0caf5', fgDark: '#a9b1d6',
    comment: '#565f89', blue: '#7aa2f7', cyan: '#7dcfff', green: '#9ece6a', magenta: '#bb9af7',
    red: '#f7768e', orange: '#ff9e64', yellow: '#e0af68', teal: '#73daca',
    selection: '#283457', border: '#2a2e42', borderActive: '#7aa2f7', dim: '#3b4261',
  });
});

// ---------------------------------------------------------------- glyphs

test('unicode and ASCII glyph sets are key-complete and in sync', () => {
  for (const which of ['unicode', 'ascii']) {
    const set = GLYPH_SETS[which];
    assert.deepEqual(Object.keys(set).sort(), [...GLYPH_KEYS].sort(), `${which} glyph keys`);
    for (const key of GLYPH_KEYS) {
      assert.equal(typeof set[key], 'string');
      assert.ok(set[key].length >= 1, `${which}.${key} should be non-empty`);
    }
  }
  // The live GLYPHS is one of the two sets.
  assert.ok(GLYPHS === GLYPH_SETS.unicode || GLYPHS === GLYPH_SETS.ascii);
});

// ---------------------------------------------------------------- render helpers

test('bar() fills the proportional number of cells', () => {
  const full = GLYPHS.barFull, empty = GLYPHS.barEmpty;
  const segs = bar(0.5, 'x', 10);
  // segs[0] = filled run, segs[1] = empty run
  assert.equal(segs[0].t, full.repeat(5));
  assert.equal(segs[1].t, empty.repeat(5));
  assert.equal(bar(0, 'x', 10)[0].t, '');
  assert.equal(bar(1, 'x', 10)[0].t, full.repeat(10));
  // out-of-range fractions clamp
  assert.equal(bar(2, 'x', 10)[0].t, full.repeat(10));
  assert.equal(bar(-1, 'x', 10)[0].t, '');
});

test('statusGlyph maps each status to its glyph', () => {
  assert.equal(statusGlyph('pass')[0], GLYPHS.pass);
  assert.equal(statusGlyph('fail')[0], GLYPHS.fail);
  assert.equal(statusGlyph('partial')[0], GLYPHS.partial);
  assert.equal(statusGlyph('anything-else')[0], GLYPHS.running);
});

test('deltaColor / rateColor classify movement', () => {
  // distinct colors for up / down / flat
  assert.notEqual(deltaColor('+5.0%'), deltaColor('-5.0%'));
  assert.equal(deltaColor('+0.0%'), deltaColor('0.0%')); // flat ⇒ neutral, not green
  assert.notEqual(rateColor(3, 3), rateColor(0, 3));      // all-pass vs none-pass differ
});

test('passFrac / segLen / trunc behave', () => {
  assert.deepEqual(passFrac('2/3'), [2, 3]);
  assert.deepEqual(passFrac('—'), [0, 0]);
  assert.equal(segLen([{ t: 'ab', c: 'x' }, { t: 'cde', c: 'y' }]), 5);
  assert.equal(trunc('hello world', 5), 'hell…');
  assert.equal(trunc('hi', 5), 'hi');
});
