// W-000042: the run console renders errored cases distinctly — an orange "!"
// row reading "error" with the case's message beneath it — instead of the red
// 0/0 fail bar, and the done header calls out "M errored" separately. Rendered
// via ink-testing-library like tests/app.smoke.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import { createElement } from 'react';

import { RunConsole } from '../dist/tui/RunConsole.js';

const sleep = (n) => new Promise((r) => setTimeout(r, n));
const waitFor = async (pred, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await sleep(10);
  }
  return false;
};

// State literals match the RunConsole reducer's RunState shape (the reducer
// itself isn't exported; the component only reads these fields).
const doneState = (cases, { passed, failed }) => ({
  active: true,
  done: true,
  skill: 'demo',
  compare: false,
  cases,
  passed,
  failed,
  error: null,
});

const passCase = { id: 'case-pass', phase: 'pass', assertTotal: 3, assertPass: 3 };
const failCase = { id: 'case-fail', phase: 'fail', assertTotal: 3, assertPass: 1 };
const errCase = { id: 'case-err', phase: 'fail', assertTotal: 0, assertPass: 0, message: 'runner exploded: ENOENT', errored: true };

test('errored case renders an error row with its message, distinct from the fail row', async () => {
  // state.failed comes from the run summary, which counts the errored case as
  // failed — the console must not change that math, only the display.
  const state = doneState([passCase, failCase, errCase], { passed: 1, failed: 2 });
  const { lastFrame, unmount } = render(createElement(RunConsole, { state, elapsed: 1.2, frame: 0 }));
  assert.ok(await waitFor(() => /run complete/.test(lastFrame() ?? '')), 'done header should render');
  const frame = lastFrame() ?? '';
  const lines = frame.split('\n');

  const errRow = lines.find((l) => l.includes('case-err'));
  assert.ok(errRow, 'errored case row renders');
  assert.match(errRow, /!\s+case-err/, 'errored row leads with the "!" glyph');
  assert.match(errRow, /error/, 'errored row reads "error" instead of an assertion count');
  assert.ok(!/0\/0/.test(errRow), 'errored row does not render a 0/0 fail count');

  const msgLine = lines[lines.indexOf(errRow) + 1] ?? '';
  assert.match(msgLine, /runner exploded: ENOENT/, "the case's message renders beneath its row");

  const failRow = lines.find((l) => l.includes('case-fail'));
  assert.ok(failRow, 'failed case row renders');
  assert.match(failRow, /1\/3/, 'failed row keeps its assertion count');
  assert.ok(!/error/.test(failRow), 'failed row is not marked as an error');

  assert.match(frame, /1 passed/, 'header keeps the summary pass count');
  assert.match(frame, /2 failed/, 'header keeps the summary fail count untouched');
  assert.match(frame, /1 errored/, 'header calls out the errored case count');
  unmount();
});

test('clean run output never mentions errored', async () => {
  const state = doneState([passCase, { ...passCase, id: 'case-pass-2' }], { passed: 2, failed: 0 });
  const { lastFrame, unmount } = render(createElement(RunConsole, { state, elapsed: 0.8, frame: 0 }));
  assert.ok(await waitFor(() => /run complete/.test(lastFrame() ?? '')), 'done header should render');
  const frame = lastFrame() ?? '';
  assert.match(frame, /2 passed/);
  assert.ok(!/errored/.test(frame), 'clean runs never mention errored');
  assert.ok(!/error/.test(frame), 'clean runs render no error rows at all');
  unmount();
});
