// Smoke test for the TUI render + initial keymap, via ink-testing-library.
// Requires: npm install -D ink-testing-library
// Runs under the repo's `npm test` (build first, then node --test).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render } from 'ink-testing-library';
import { createElement } from 'react';

import { App } from '../dist/tui/app.js';

const fakeCase = {
  id: 'case-a', status: 'pass', prompt: 'Do the thing.', expected: 'Done.', setup: 'empty',
  model: 'anthropic/claude:medium', judge: '—', dur: '1.0s', tin: 0, tout: 0, cr: 0, cw: 0, ttot: 0,
  cost: '$0.0000', ctxWin: 0, ctxPct: 0, tools: [], toolErr: 0, skillReads: '—', ext: 0, mcp: 0,
  withP: 0, withT: 0, withoutP: 0, withoutT: 0, delta: '',
  assistant: 'hello', assistantWithout: '',
  trace: { callCount: 0, errors: 0, fileTouches: 0, bashCount: 0, toolCalls: [], skillReads: [], writtenFiles: [], editedFiles: [], externalCalls: [] },
  context: { mode: 'isolated', agentDir: '', attachedSkills: [], activeTools: [], availableTools: [], mcpTools: [], mcpServers: [], ambient: {} },
  outputs: [],
  assertions: [{ type: 'file-exists', det: true, label: 'x', target: '', passed: true, evidence: '', raw: '' }],
};
const fakeSkill = {
  id: 'demo', dir: '/tmp/demo', runDir: '/tmp/demo/run', role: 'target',
  model: 'anthropic/claude:medium', judge: '—', passed: 1, total: 1,
  withP: 0, withT: 0, withoutP: 0, withoutT: 0, delta: '', totalCost: '$0.00', totalTokens: 0, avgDur: '1.0s',
  cases: [fakeCase],
};

const sleep = (n) => new Promise((r) => setTimeout(r, n));
const waitFor = async (pred, timeoutMs = 2000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (pred()) return true;
    await sleep(10);
  }
  return false;
};

test('App renders the four panels and the selected skill', () => {
  const { lastFrame, unmount } = render(createElement(App, { skills: [fakeSkill], runs: [], onAction() {} }));
  const frame = lastFrame() ?? '';
  assert.match(frame, /Skills/);
  assert.match(frame, /Cases/);
  assert.match(frame, /Assertions/);
  assert.match(frame, /Runs/);
  assert.match(frame, /demo/);
  unmount();
});

test('empty workspace shows the no-runs hint', () => {
  const { lastFrame, unmount } = render(createElement(App, { skills: [], runs: [], onAction() {} }));
  assert.match(lastFrame() ?? '', /No eval runs found/);
  unmount();
});

test('typing a filter narrows the case list', async () => {
  const { lastFrame, stdin, unmount } = render(createElement(App, { skills: [fakeSkill], runs: [], onAction() {} }));
  // Poll the frame instead of guessing fixed delays — ink commits renders
  // asynchronously, so a single setTimeout is racy.
  // The normal status bar contains "help"; the filter prompt replaces it and
  // doesn't — that's how we tell filter mode is actually engaged (matching just
  // "/ " gives a false positive on the "/ filter" hint).
  const filterEngaged = (f) => /\//.test(f) && !/help/.test(f);

  await waitFor(() => /Skills/.test(lastFrame() ?? ''));
  await sleep(150);                // let ink's useInput effect subscribe to stdin
  stdin.write('/');                // enter filter mode
  assert.ok(await waitFor(() => filterEngaged(lastFrame() ?? '')), 'filter prompt should appear');
  await sleep(150);                // entering filter mode re-subscribes useInput;
                                   // settle so the first typed key isn't dropped
  // useInput delivers a multi-char write as one chunk, which the >1-char guard
  // (used to drop escape sequences) rejects — and rapid back-to-back writes get
  // coalesced into one chunk too — so type one key at a time, settling between.
  // Use a query that matches the skill, so a skill remains selected and the
  // status bar (which holds the filter prompt) still renders.
  for (const ch of 'demo') { stdin.write(ch); await sleep(100); }
  assert.ok(await waitFor(() => /\/ demo/.test(lastFrame() ?? '')), 'filter prompt should echo the typed query');
  unmount();
});

test('App responds to terminal resize events', async () => {
  const { lastFrame, stdout, unmount } = render(createElement(App, { skills: [fakeSkill], runs: [], onAction() {} }));
  assert.ok(await waitFor(() => /Skills/.test(lastFrame() ?? '')), 'initial TUI should render');

  Object.defineProperty(stdout, 'columns', { configurable: true, get: () => 60 });
  Object.defineProperty(stdout, 'rows', { configurable: true, get: () => 17 });
  stdout.emit('resize');

  assert.ok(await waitFor(() => /Terminal too small/.test(lastFrame() ?? '')), 'resize should re-render using the new terminal dimensions');
  unmount();
});
