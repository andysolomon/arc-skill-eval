import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMain } from '../dist/tui/view-model.js';
import { COLORS } from '../dist/tui/theme.js';

const baseCase = {
  id: 'long-grading', status: 'fail', prompt: 'Evaluate the skill.', expected: 'The skill should be evaluated.', setup: 'empty',
  model: 'anthropic/claude:medium', judge: '—', dur: '1.0s', tin: 0, tout: 0, cr: 0, cw: 0, ttot: 0,
  cost: '$0.0000', ctxWin: 200000, ctxPct: 0, tools: [], toolErr: 0, skillReads: '—', ext: 0, mcp: 0,
  withP: 0, withT: 0, withoutP: 0, withoutT: 0, delta: '',
  assistant: '', assistantWithout: '', trace: { callCount: 0, errors: 0, fileTouches: 0, bashCount: 0, toolCalls: [], skillReads: [], writtenFiles: [], editedFiles: [], externalCalls: [] },
  context: { mode: 'isolated', agentDir: '', attachedSkills: [], activeTools: [], availableTools: [], mcpTools: [], mcpServers: [], ambient: {} },
  outputs: [],
  assertions: [],
};

const fakeSkill = {
  id: 'demo', dir: '/tmp/demo', runDir: '/tmp/demo/run', role: 'target',
  model: 'anthropic/claude:medium', judge: '—', passed: 0, total: 1,
  withP: 0, withT: 0, withoutP: 0, withoutT: 0, delta: '', totalCost: '$0.00', totalTokens: 0, avgDur: '1.0s',
  cases: [baseCase],
};

const selectedAssertion = (overrides) => ({
  type: 'llm-judge', det: false, target: '', raw: '',
  label: 'placeholder assertion label', evidence: 'placeholder evidence', passed: false,
  ...overrides,
});

const lineText = (line) => line.segs.map((s) => s.t).join('');
const viewText = (view) => view.lines.map(lineText).join('\n');

function caseWithAssertions(assertions) {
  return { ...baseCase, assertions };
}

test('case overview wraps long assertion labels and evidence without ellipses', () => {
  const longLabel = 'The response shows the assistant is setting up automated semantic versioning release automation for this project rather than only giving generic advice';
  const longEvidence = 'Judge returned detailed evidence explaining that the response configured semantic-release, added Conventional Commits guidance, and updated project files accordingly';
  const cs = caseWithAssertions([selectedAssertion({ label: longLabel, evidence: longEvidence })]);

  const view = buildMain('cases', fakeSkill, cs, cs.assertions[0], undefined, 'overview', true);
  const text = viewText(view);
  const normalized = text.replace(/\s+/g, ' ');

  assert.match(normalized, /setting up automated semantic versioning release automation/);
  assert.match(normalized, /rather than only giving generic advice/);
  assert.match(normalized, /configured semantic-release, added Conventional Commits guidance/);
  assert.match(normalized, /updated project files accordingly/);
  assert.doesNotMatch(text, /…/);
});

test('case overview colors wrapped failed and passing evidence appropriately', () => {
  const failedEvidence = 'Failed evidence wraps across several words and must keep the crimson failure tint on every wrapped line for readability with extra failure context continuing beyond the wrapping boundary';
  const passingEvidence = 'Passing evidence wraps across several words and must keep the muted comment tint on every wrapped line for readability with extra passing context continuing beyond the wrapping boundary';
  const cs = caseWithAssertions([
    selectedAssertion({ passed: false, label: 'failed assertion label that wraps for color testing', evidence: failedEvidence }),
    selectedAssertion({ passed: true, label: 'passing assertion label that wraps for color testing', evidence: passingEvidence }),
  ]);

  const view = buildMain('cases', fakeSkill, cs, cs.assertions[0], undefined, 'overview', true);
  const failedLines = view.lines.filter((line) => /Failed evidence|crimson failure tint|failure context/.test(lineText(line)));
  const passingLines = view.lines.filter((line) => /Passing evidence|muted comment tint|passing context/.test(lineText(line)));

  assert.ok(failedLines.length >= 2, 'failed evidence should wrap across multiple lines');
  assert.ok(passingLines.length >= 2, 'passing evidence should wrap across multiple lines');
  for (const line of failedLines) {
    assert.ok(line.segs.every((seg) => seg.c === COLORS.red), `expected failed evidence line to be red: ${lineText(line)}`);
  }
  for (const line of passingLines) {
    assert.ok(line.segs.every((seg) => seg.c === COLORS.comment), `expected passing evidence line to use comment color: ${lineText(line)}`);
  }
});
