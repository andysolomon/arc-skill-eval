import assert from 'node:assert/strict';
import test from 'node:test';

import { bar } from '../dist/tui/theme.js';
import { GLYPHS } from '../dist/tui/caps.js';

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
