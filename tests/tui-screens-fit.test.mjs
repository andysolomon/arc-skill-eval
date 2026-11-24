// Gate: every screen of the browse TUI fits the terminal, at 80x24, at
// 120x40, and across resizes, with worst-case data.
//
// Ways a screen has failed to fit (six past fixes), and the check here that
// catches each one:
//   1. Frame shorter than the terminal. Ink clears the screen only before a
//      frame at least as tall as the terminal, so a shorter overlay is drawn
//      over the old frame's leftovers (ecf887b).                 -> frame height
//   2. Frame taller than the terminal. The top scrolls away (331db62).
//                                                                -> frame height
//   3. A line wider than the terminal. The terminal wraps it, and every line
//      below moves down.                                         -> line width
//   4. A box given more rows or columns than it has room for. Ink cuts the
//      rest, or draws it over the next box: panel rows (22a2e0e), an overlay
//      taller than the screen once the screen clips it, a one-row bar whose
//      text wraps.                                               -> box overflow
//   5. Text Ink truncates at a box edge because the view never wrapped or cut
//      it to the box width (f74701c, c04adef).                   -> cut text
//   6. The selected row is outside its panel (22a2e0e).          -> selection
//   7. A layout still sized for the old terminal after a resize (5005741).
//                                                                -> height and width after resize
// Worst-case data drives every check: long skill and case ids, long unbroken
// grading evidence, more skills and cases than fit, long typed input, and a
// run with more cases than the screen has rows.
//
// The App renders through Ink's real renderer into a fake TTY whose size the
// test sets and changes. Runs go through the real in-process run path against
// a local fake model server. Every frame Ink writes is checked, and the last
// frame of each screen is written to test-artifacts/tui-fit/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripVTControlCharacters } from 'node:util';
import stringWidth from 'string-width';

// Plain frames with Unicode glyphs on every machine. Set before Ink, chalk,
// and the TUI read the environment.
process.env.FORCE_COLOR = '0';
process.env.LC_ALL = 'C.UTF-8';
delete process.env.ARC_TUI_ASCII;
delete process.env.NO_COLOR;

const React = await import('react');
const ink = await import('ink');
const { App } = await import('../dist/tui/app.js');
const { loadWorkspace } = await import('../dist/tui/load-artifacts.js');
const { GLYPHS } = await import('../dist/tui/caps.js');

const ARTIFACTS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test-artifacts', 'tui-fit');

// ------------------------------------------------------------------ fake TTY

class Terminal extends EventEmitter {
  isTTY = true;
  frames = [];
  constructor(columns, rows) { super(); this.columns = columns; this.rows = rows; }
  // Ink also writes cursor show/hide sequences; those are not frames.
  write = (frame) => { if (!/^(\x1b\[\?25[lh])+$/.test(frame)) this.frames.push(frame); return true; };
  resize(columns, rows) { this.columns = columns; this.rows = rows; this.emit('resize'); }
}

class Keyboard extends EventEmitter {
  isTTY = true;
  data = null;
  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
  read = () => { const d = this.data; this.data = null; return d; };
  press = (data) => { this.data = data; this.emit('readable'); this.emit('data', data); };
}

const KEY = { up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D', tab: '\t', esc: '\x1b', enter: '\r', pgdn: '\x1b[6~' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait until Ink stops writing frames, or until `until(lastFrame)` holds. */
async function settle(term, until, timeoutMs = 30_000) {
  const start = Date.now();
  let count = -1;
  let quietSince = Date.now();
  while (Date.now() - start < timeoutMs) {
    const last = term.frames.at(-1) ?? '';
    if (until) { if (until(last)) { await sleep(30); return; } }
    else if (term.frames.length === count) { if (Date.now() - quietSince >= 100) return; }
    else { count = term.frames.length; quietSince = Date.now(); }
    await sleep(10);
  }
  if (until) throw new Error(`timed out waiting for a frame; last frame:\n${term.frames.at(-1) ?? ''}`);
}

// ------------------------------------------------------------------ checks

const plain = (s) => stripVTControlCharacters(s);
const preview = (s, n = 48) => { const t = plain(s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/** Checks 1-3 and 7: the frame is exactly `rows` lines, none wider than `cols`. */
function checkFrame(where, frame, cols, rows) {
  const out = [];
  const lines = frame.split('\n');
  if (lines.length !== rows) {
    const d = lines.length - rows;
    out.push(`${where}: the frame is ${lines.length} lines and the terminal has ${rows}, ${Math.abs(d)} ${d > 0 ? 'too many' : 'too few'}. Draw it with screen() from src/tui/screen.tsx, which is exactly the terminal's size.`);
  }
  lines.forEach((line, i) => {
    const w = stringWidth(plain(line));
    if (w > cols) out.push(`${where}: line ${i + 1} is ${w} columns and the terminal has ${cols}, ${w - cols} too wide: "${preview(line)}"`);
  });
  return out;
}

// A box's children are separate blocks; a text's children are one run of text.
const textOf = (node) => (node.nodeName === '#text' ? node.nodeValue : (node.childNodes ?? []).map(textOf).join(node.nodeName === 'ink-box' ? '\n' : ''));
const labelOf = (node) => preview(textOf(node).split('\n').find((l) => l.trim()) ?? node.nodeName, 40);
const EDGE = { left: 0, top: 1, right: 2, bottom: 3 };

const clips = (node, axis) => node.style?.overflow === 'hidden' || node.style?.[axis] === 'hidden';

/**
 * Checks 4 and 5, on the Ink layout tree behind the last frame. A box with
 * overflow hidden shows part of its content on purpose (a one-row input that
 * scrolls), so its content may run past it. The screen frame is the
 * exception: nothing may run past the terminal.
 */
function checkLayout(where, root) {
  const out = [];
  const frame = root.childNodes?.[0];
  const walk = (node) => {
    const y = node.yogaNode;
    if (!y) return;
    if (node.nodeName === 'ink-text') {
      const w = Math.round(y.getComputedWidth());
      const h = Math.round(y.getComputedHeight());
      const text = plain(textOf(node));
      const lines = text.split('\n');
      const widest = Math.max(0, ...lines.map((l) => stringWidth(l)));
      const textWrap = node.style?.textWrap ?? 'wrap';
      if (!text) return;
      if (textWrap.startsWith('truncate')) {
        if (widest > w) out.push(`${where}: Ink cut ${widest - w} columns off "${preview(text)}", which is ${widest} columns in a ${w}-column box. Wrap it, or trunc() it to the width the view computes.`);
        if (lines.length > h) out.push(`${where}: "${preview(text)}" needs ${lines.length} rows and its box has ${h}, ${lines.length - h} rows drawn past it.`);
      } else if (w > 0) {
        // A lower bound: word wrapping can only add rows.
        const need = lines.reduce((n, l) => n + Math.max(1, Math.ceil(stringWidth(l) / w)), 0);
        if (need > h) out.push(`${where}: "${preview(text)}" wraps to at least ${need} rows and its box has ${h}, ${need - h} rows drawn past it.`);
      }
      return; // nested <Text> is part of this text
    }
    const w = y.getComputedWidth();
    const h = y.getComputedHeight();
    const right = w - y.getComputedBorder(EDGE.right) - y.getComputedPadding(EDGE.right);
    const bottom = h - y.getComputedBorder(EDGE.bottom) - y.getComputedPadding(EDGE.bottom);
    for (const child of node.childNodes ?? []) {
      const c = child.yogaNode;
      if (!c) continue;
      const overRows = node !== frame && clips(node, 'overflowY') ? 0 : Math.round(c.getComputedTop() + c.getComputedHeight() - bottom);
      const overCols = node !== frame && clips(node, 'overflowX') ? 0 : Math.round(c.getComputedLeft() + c.getComputedWidth() - right);
      if (overRows > 0) out.push(`${where}: "${labelOf(child)}" needs ${overRows} more rows than "${labelOf(node)}" has room for (box is ${Math.round(h)} rows), so ${overRows} rows are cut or drawn past it.`);
      if (overCols > 0) out.push(`${where}: "${labelOf(child)}" is ${overCols} columns wider than the room in "${labelOf(node)}" (box is ${Math.round(w)} columns), so ${overCols} columns are cut.`);
    }
    for (const child of node.childNodes ?? []) walk(child);
  };
  walk(root);
  return out;
}

/** Check 6: the focused panel marks the selected row, and that row shows `id`. */
function checkSelected(where, frame, id) {
  const lines = frame.split('\n').map(plain);
  const marked = lines.filter((l) => l[1] === GLYPHS.accent);
  if (marked.length === 0) return [`${where}: the selected row "${id}" is not on screen. No row in the side panels is marked selected.`];
  const prefix = id.slice(0, 16);
  if (!marked.some((l) => l.includes(prefix))) return [`${where}: the selected row should show "${id}", but the marked row is "${preview(marked[0])}".`];
  return [];
}

// ------------------------------------------------------------------ driver

class Tour {
  constructor(app, label) {
    this.app = app;
    this.label = label;
    this.dir = path.join(ARTIFACTS, label);
    this.seen = 0;
    this.n = 0;
    this.problems = [];
    rmSync(this.dir, { recursive: true, force: true });
    mkdirSync(this.dir, { recursive: true });
  }

  get size() { return { cols: this.app.term.columns, rows: this.app.term.rows }; }

  async press(...keys) {
    for (const k of keys) { this.app.keys.press(k); await sleep(15); }
  }

  async type(text) { this.app.keys.press(text); await sleep(15); }

  /** Check every frame since the last shot, then save the last one. */
  async shot(name, { selected, until, resized = false } = {}) {
    await settle(this.app.term, until);
    const { cols, rows } = this.size;
    const where = `${this.label} ${name}`;
    const frames = this.app.term.frames.slice(this.seen);
    this.seen = this.app.term.frames.length;
    const last = this.app.term.frames.at(-1) ?? '';
    // Right after a resize Ink redraws the old layout once at the new size,
    // before the App reflows. Only the reflowed frame has to fit.
    const checked = new Set(resized ? [last] : frames);
    for (const frame of checked) this.problems.push(...checkFrame(where, frame, cols, rows));
    this.problems.push(...checkLayout(where, this.app.probe.current));
    if (selected) this.problems.push(...checkSelected(where, last, selected));
    this.n += 1;
    const file = `${String(this.n).padStart(2, '0')}-${name}.txt`;
    writeFileSync(path.join(this.dir, file), `${cols}x${rows} ${name}\n${'-'.repeat(cols)}\n${plain(last)}\n${'-'.repeat(cols)}\n`);
    return last;
  }

  async resize(cols, rows, name, opts = {}) {
    this.app.term.resize(cols, rows);
    return this.shot(name, { ...opts, resized: true });
  }
}

function mountApp(root, ws, cols, rows) {
  const term = new Terminal(cols, rows);
  const keys = new Keyboard();
  const probe = React.createRef();
  let instance;
  const element = () =>
    React.createElement(ink.Box, { ref: probe, flexDirection: 'column' },
      React.createElement(App, { skills: ws.skills, runs: ws.runs, onAction() {}, onReload, showWithout: true }));
  // Same contract as browse-command.ts: reload, then re-render in place.
  async function onReload() {
    const fresh = await loadWorkspace(root);
    ws.skills = fresh.skills;
    ws.runs = fresh.runs;
    instance.rerender(element());
  }
  instance = ink.render(element(), { stdout: term, stderr: new Terminal(cols, rows), stdin: keys, debug: true, exitOnCtrlC: false, patchConsole: false });
  return { term, keys, probe, unmount: () => instance.unmount() };
}

// ------------------------------------------------------------------ worst-case data

const LONG = 'with-an-identifier-long-enough-to-overflow-every-column';
const BIG_SKILL = `skill-${LONG}`;
const caseId = (i) => `case-${String(i).padStart(2, '0')}-${LONG}`;
const BIG_CASES = 30;
const SMALL_SKILLS = 14;
const LONG_MODEL = { provider: 'fake-llm', id: 'a-runner-model-with-a-very-long-name-20991231', thinking: 'high' };
const EVIDENCE =
  'The response wrote the report but skipped the summary table the prompt asked for, then cited ' +
  '/very/long/path/to/an/artifact/that/never/breaks/because/it/has/no/spaces/at/all/report-final-v2-really-final.json ' +
  'as proof, which does not exist in the workspace. ' +
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. '.repeat(3);

const writeJson = async (p, obj) => { await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, JSON.stringify(obj, null, 2)); };

async function writeSkill(root, name, cases, { withRun = true } = {}) {
  const dir = path.join(root, 'skills', name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: A skill whose name and cases are as long as a real repo allows.\n---\n\nReply with the single word ready.\n`);
  await writeJson(path.join(dir, 'evals', 'evals.json'), {
    skill_name: name,
    evals: cases.map((c) => ({
      id: c.id,
      prompt: `Write the quarterly report for ${c.id} and include a summary table, a list of sources, and every caveat a reviewer would ask about.`,
      expected_output: 'A report with a summary table and sources. '.repeat(4),
      assertions: [{ type: 'regex-match', pattern: c.pass ? 'ready' : 'never-matches' }],
    })),
  });
  if (!withRun) return dir;
  for (const c of cases) {
    const caseDir = path.join(dir, 'evals-runs', 'run-1', `eval-${c.id}`);
    const results = Array.from({ length: c.assertions }, (_, k) => ({
      text: `regex-match: the response names every source file and quotes the exact figure from section ${k + 1} of the input`,
      passed: c.pass || k % 2 === 0,
      evidence: EVIDENCE,
      assertion: { type: 'regex-match', pattern: `source-${k}` },
    }));
    const passed = results.filter((r) => r.passed).length;
    await writeJson(path.join(caseDir, 'grading.json'), {
      case_id: c.id, assertion_results: results,
      summary: { passed, failed: results.length - passed, total: results.length, pass_rate: passed / results.length },
    });
    await writeJson(path.join(caseDir, 'timing.json'), {
      total_tokens: 123456, duration_ms: 98765, model: LONG_MODEL,
      token_usage: { input_tokens: 100000, output_tokens: 23456, total_tokens: 123456 },
      estimated_cost_usd: 12.3456, context_window_tokens: 200000, context_window_used_percent: 61.7,
    });
  }
  return dir;
}

async function buildWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), 'arc-tui-fit-'));
  await writeSkill(root, BIG_SKILL, Array.from({ length: BIG_CASES }, (_, i) => ({ id: caseId(i + 1), pass: i % 3 !== 1, assertions: 8 })));
  for (let i = 0; i < SMALL_SKILLS; i++) await writeSkill(root, `small-${String(i).padStart(2, '0')}`, [{ id: 'only-case', pass: true, assertions: 1 }]);
  await writeSkill(root, `zz-no-runs-${LONG}`, [{ id: caseId(99), pass: true, assertions: 1 }], { withRun: false });
  return root;
}

// ------------------------------------------------------------------ fake model server

/** An OpenAI-compatible server. `hang` holds requests open; `answer` replies "ready". */
async function startModelServer() {
  const state = { mode: 'answer', requests: 0 };
  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      state.requests += 1;
      if (state.mode === 'hang') return; // held until the run aborts
      const model = body ? JSON.parse(body).model : 'fake-1';
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const chunk = (payload) => res.write(`data: ${JSON.stringify({ id: 'c1', object: 'chat.completion.chunk', created: 0, model, ...payload })}\n\n`);
      chunk({ choices: [{ index: 0, delta: { role: 'assistant', content: 'ready' }, finish_reason: null }] });
      chunk({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] });
      chunk({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 1, total_tokens: 13 } });
      res.end('data: [DONE]\n\n');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return {
    state,
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }),
  };
}

async function writeAgentDir(root, baseUrl) {
  const agentDir = path.join(root, 'agent');
  const model = { id: 'fake-1', contextWindow: 32000, maxTokens: 1024, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } };
  await writeJson(path.join(agentDir, 'models.json'), {
    providers: { 'fake-llm': { baseUrl, api: 'openai-completions', apiKey: '$ARC_TUI_FIT_KEY', authHeader: true, models: [model] } },
  });
  await writeJson(path.join(agentDir, 'settings.json'), { defaultProvider: 'fake-llm', defaultModel: 'fake-1' });
  return agentDir;
}

// ------------------------------------------------------------------ the tour

/** Drive every screen once at the terminal's current size. */
async function tourEveryScreen(t, server) {
  const sel = caseId(21);
  // Browser, Cases panel focused: the first, last, and 21st of 30 cases selected.
  await t.shot('browser-case-1-of-30', { selected: caseId(1) });
  await t.press('G');
  await t.shot('browser-case-30-of-30', { selected: caseId(30) });
  await t.press('g', ...Array(20).fill('j'));
  await t.shot('browser-case-21-of-30', { selected: sel });
  for (let i = 0; i < 5; i++) { await t.press(']'); await t.shot(`case-mode-${i + 1}`, { selected: sel }); }
  await t.press(...Array(5).fill('['));
  await t.press(KEY.right, 'j', 'j');
  await t.shot('case-pane-cursor');
  await t.press(KEY.left, '3', 'G');
  await t.shot('assertions-last-of-8');
  await t.press(KEY.right);
  await t.shot('assertion-pane-cursor');
  await t.press(KEY.left, '4');
  await t.shot('runs');
  await t.press('1', 'G');
  await t.shot('skills-last-of-16', { selected: `zz-no-runs-${LONG}` });
  await t.press('f');
  await t.shot('flash-no-runs-warning');
  await t.press('g', '2', 'g');

  // Help overlay, top and bottom.
  await t.press('?');
  await t.shot('help-top');
  await t.press(...Array(12).fill(KEY.pgdn));
  await t.shot('help-bottom');
  await t.press('x');

  // Filter typing, a filter that hides everything, failures-only, a note.
  await t.press('/');
  await t.type(`no-skill-matches-this-${LONG}-${LONG}`);
  await t.shot('filter-typing-no-match');
  await t.press(KEY.enter);
  await t.shot('filter-no-match');
  await t.press('/', KEY.esc);
  await t.press('F');
  await t.shot('failures-only', { selected: caseId(2) });
  await t.press('F');
  await t.press('f');
  await t.type(`a note long enough to run past the status bar: ${EVIDENCE}`);
  await t.shot('note-typing');
  await t.press(KEY.esc);

  // Run options form, with a long typed flag.
  await t.press(...Array(20).fill('j'));
  await t.press('o');
  await t.shot('run-options');
  await t.press(...Array(8).fill(KEY.tab));
  await t.type(`--iteration ${LONG}-${LONG}`);
  await t.shot('run-options-long-flags');
  await t.press(KEY.esc);

  // New-case form: fields with a long prompt, the assertion list, the type picker.
  await t.press('n');
  await t.shot('new-case-fields');
  await t.type(`new-case-${LONG}`);
  await t.press(KEY.tab);
  await t.type(EVIDENCE);
  await t.shot('new-case-long-prompt');
  await t.press(KEY.enter, KEY.enter);
  await t.shot('new-case-assertions');
  await t.press('a');
  await t.shot('new-case-pick-type');
  await t.press(KEY.esc, KEY.esc);

  // Guided create form: confirm, model entry, deterministic review.
  await t.press('1', 'g');
  await t.press('C');
  await t.shot('create-confirm');
  await t.press('m');
  await t.shot('create-model');
  await t.press(KEY.esc, 'd');
  await t.shot('create-review', { until: (f) => /Proposal/.test(f) });
  await t.press(KEY.esc);

  // Run console: failed to start, running 30 cases, stopping, stopped, complete.
  await t.press('o', ...Array(8).fill(KEY.tab));
  await t.type(`--not-a-flag-${LONG}`);
  await t.press(KEY.enter);
  await t.shot('run-failed', { until: (f) => /run failed/.test(f) });
  await t.press(KEY.esc);
  server.state.mode = 'hang';
  await t.press('r');
  await t.shot('run-running-30-cases', { until: (f) => /running evals/.test(f) && server.state.requests > 0 });
  await t.press(KEY.esc);
  await t.shot('run-stopping-or-stopped', { until: (f) => /run cancelled|stopping run/.test(f) });
  await t.shot('run-cancelled', { until: (f) => /run cancelled/.test(f) });
  await t.press(KEY.esc);
  server.state.mode = 'answer';
  await t.press('2', 'r');
  await t.shot('run-complete-one-case', { until: (f) => /run complete/.test(f) });
  await t.press(KEY.enter);
  await t.shot('browser-after-reload');
}

async function withWorkspace(fn) {
  const root = await buildWorkspace();
  const server = await startModelServer();
  const previous = { agent: process.env.PI_CODING_AGENT_DIR, key: process.env.ARC_TUI_FIT_KEY };
  process.env.PI_CODING_AGENT_DIR = await writeAgentDir(root, server.baseUrl);
  process.env.ARC_TUI_FIT_KEY = 'fake-secret';
  try {
    await fn(root, server);
  } finally {
    for (const [k, v] of [['PI_CODING_AGENT_DIR', previous.agent], ['ARC_TUI_FIT_KEY', previous.key]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    await server.close();
    await rm(root, { recursive: true, force: true });
  }
}

const report = (problems) => (problems.length ? `${problems.length} problem(s):\n  - ${[...new Set(problems)].join('\n  - ')}` : '');

for (const [cols, rows] of [[80, 24], [120, 40]]) {
  test(`every browse screen fits a ${cols}x${rows} terminal`, { timeout: 240_000 }, async () => {
    await withWorkspace(async (root, server) => {
      const app = mountApp(root, await loadWorkspace(root), cols, rows);
      const t = new Tour(app, `${cols}x${rows}`);
      try {
        await tourEveryScreen(t, server);
      } finally {
        app.unmount();
      }
      assert.deepEqual(t.problems, [], report(t.problems));
    });
  });
}

test('the browser reflows on every resize, down to the too-small notice', { timeout: 60_000 }, async () => {
  await withWorkspace(async (root) => {
    const app = mountApp(root, await loadWorkspace(root), 80, 24);
    const t = new Tour(app, 'resize');
    try {
      await t.shot('start', { selected: caseId(1) });
      await t.press(...Array(20).fill('j'));
      await t.shot('80x24', { selected: caseId(21) });
      await t.resize(120, 40, 'to-120x40', { selected: caseId(21) });
      await t.press('?');
      await t.resize(80, 24, 'help-to-80x24');
      await t.press('x');
      await t.resize(100, 30, 'to-100x30', { selected: caseId(21) });
      await t.resize(60, 17, 'to-60x17-too-small');
      await t.resize(80, 24, 'back-to-80x24', { selected: caseId(21) });
    } finally {
      app.unmount();
    }
    assert.deepEqual(t.problems, [], report(t.problems));
  });
});

test('an empty workspace fills the screen', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'arc-tui-fit-empty-'));
  try {
    const app = mountApp(root, await loadWorkspace(root), 80, 24);
    const t = new Tour(app, 'empty');
    try {
      const frame = await t.shot('no-runs');
      assert.match(frame, /No eval runs found/);
      await t.resize(120, 40, 'to-120x40');
    } finally {
      app.unmount();
    }
    assert.deepEqual(t.problems, [], report(t.problems));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
