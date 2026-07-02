// Loader tests for the TUI artifact reader.
// Run via the repo's existing test script: `npm test` (builds, then
// `node --test tests/*.test.mjs`). Imports the compiled loader from dist/.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { loadWorkspace, reloadSkill } from '../dist/tui/load-artifacts.js';

const writeJson = async (p, obj) => {
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(obj, null, 2), 'utf8');
};

/** Build a skill dir with one single-run case and one compare case. */
async function buildFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'arc-tui-'));
  const skillDir = path.join(root, 'skills', 'demo');

  await writeJson(path.join(skillDir, 'evals', 'evals.json'), {
    skill_name: 'demo',
    evals: [
      {
        id: 'case-a',
        prompt: 'Do the thing.',
        expected_output: 'The thing is done.',
        assertions: [{ type: 'file-exists', path: 'out.txt' }, 'A judged claim about the response.'],
      },
      { id: 'case-b', prompt: 'Do the other thing.', expected_output: 'Done.' },
    ],
  });

  const runDir = path.join(skillDir, 'evals-runs', 'run-1');

  // case-a: single-run, mixed pass/fail (file-exists passes, judge fails)
  await writeJson(path.join(runDir, 'eval-case-a', 'grading.json'), {
    case_id: 'case-a',
    assertion_results: [
      { text: 'file-exists: out.txt', passed: true, evidence: 'Found out.txt (12 bytes)', assertion: { type: 'file-exists', path: 'out.txt' } },
      { text: 'A judged claim about the response.', passed: false, evidence: 'not satisfied', assertion: 'A judged claim about the response.' },
    ],
    summary: { passed: 1, failed: 1, total: 2, pass_rate: 0.5 },
  });
  await writeJson(path.join(runDir, 'eval-case-a', 'timing.json'), {
    total_tokens: 1000,
    duration_ms: 2500,
    model: { provider: 'anthropic', id: 'claude-opus-4-5', thinking: 'medium' },
    token_usage: { input_tokens: 800, output_tokens: 200, cache_read_tokens: 10, cache_write_tokens: 5, total_tokens: 1000 },
    estimated_cost_usd: 0.0123,
    context_window_tokens: 200000,
    context_window_used_percent: 0.5,
  });
  await writeJson(path.join(runDir, 'eval-case-a', 'tool-summary.json'), {
    tool_call_count: 3, tool_error_count: 0, tool_calls_by_name: { read: 2, write: 1 },
    skill_read_count: 1, skill_reads_by_name: { demo: 1 }, external_call_count: 0, mcp_tool_call_count: 0,
  });

  // case-b: compare run (with_skill all pass, without_skill all fail) → +100% delta
  await writeJson(path.join(runDir, 'eval-case-b', 'with_skill', 'grading.json'), {
    case_id: 'case-b', assertion_results: [{ text: 'ok', passed: true, evidence: 'yes', assertion: { type: 'file-exists', path: 'b.txt' } }],
    summary: { passed: 1, failed: 0, total: 1, pass_rate: 1 },
  });
  await writeJson(path.join(runDir, 'eval-case-b', 'with_skill', 'timing.json'), {
    total_tokens: 500, duration_ms: 1200, model: { provider: 'anthropic', id: 'claude-opus-4-5', thinking: 'medium' },
    token_usage: { input_tokens: 400, output_tokens: 100, total_tokens: 500 }, estimated_cost_usd: 0.006,
    context_window_tokens: 200000, context_window_used_percent: 0.3,
  });
  await writeJson(path.join(runDir, 'eval-case-b', 'without_skill', 'grading.json'), {
    case_id: 'case-b', assertion_results: [{ text: 'ok', passed: false, evidence: 'no', assertion: { type: 'file-exists', path: 'b.txt' } }],
    summary: { passed: 0, failed: 1, total: 1, pass_rate: 0 },
  });
  await writeJson(path.join(runDir, 'benchmark.json'), { overall: { delta: 0.5 } });

  return { root, skillDir };
}

test('loadWorkspace maps a single skill directory', async () => {
  const { root, skillDir } = await buildFixture();
  try {
    const ws = await loadWorkspace(skillDir);

    assert.equal(ws.skills.length, 1, 'one skill');
    const skill = ws.skills[0];
    assert.equal(skill.id, 'demo');
    assert.equal(path.resolve(skill.dir), path.resolve(skillDir), 'skill.dir is absolute');
    assert.equal(skill.cases.length, 2, 'two cases');

    const a = skill.cases.find((c) => c.id === 'case-a');
    assert.ok(a, 'case-a present');
    assert.equal(a.status, 'partial', '1 pass / 1 fail => partial');
    assert.equal(a.prompt, 'Do the thing.');
    assert.equal(a.expected, 'The thing is done.');

    // assertion type classification
    assert.equal(a.assertions.length, 2);
    assert.equal(a.assertions[0].type, 'file-exists');
    assert.equal(a.assertions[0].det, true, 'file-exists is deterministic');
    assert.equal(a.assertions[0].passed, true);
    assert.equal(a.assertions[1].type, 'llm-judge');
    assert.equal(a.assertions[1].det, false, 'string assertion is LLM-judged');
    assert.equal(a.assertions[1].passed, false);

    // metrics from timing.json
    assert.match(a.model, /anthropic\/claude-opus-4-5:medium/);
    assert.equal(a.ttot, 1000);
    assert.equal(a.tin, 800);
    assert.equal(a.cost, '$0.0123');

    // tools from tool-summary.json
    assert.deepEqual(a.tools.sort(), [['read', 2], ['write', 1]].sort());

    // compare case delta
    const b = skill.cases.find((c) => c.id === 'case-b');
    assert.ok(b, 'case-b present');
    assert.equal(b.status, 'pass', 'with_skill variant passes');
    assert.equal(b.delta, '+100.0%', 'with_skill 100% - without_skill 0% => +100%');

    assert.ok(ws.runs.length >= 1, 'at least one run discovered');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loadWorkspace includes eval suites that have no run artifacts yet', async () => {
  const { root, skillDir } = await buildFixture();
  try {
    const noRunDir = path.join(root, 'skills', 'no-run');
    await writeJson(path.join(noRunDir, 'evals', 'evals.json'), {
      skill_name: 'no-run',
      evals: [
        { id: 'fresh-case', prompt: 'Try the fresh eval.', expected_output: 'It can be run from browse.', setup: { kind: 'empty' } },
      ],
    });

    const ws = await loadWorkspace(path.join(root, 'skills'));

    const ids = ws.skills.map((s) => s.id).sort();
    assert.deepEqual(ids, ['demo', 'no-run']);

    const fresh = ws.skills.find((s) => s.id === 'no-run');
    assert.ok(fresh, 'no-run skill appears even without evals-runs');
    assert.equal(fresh.runDir, '', 'no run directory yet');
    assert.equal(fresh.total, 0, 'no completed cases yet');
    assert.equal(fresh.cases.length, 1, 'eval case is available for selection/rerun');
    assert.equal(fresh.cases[0].id, 'fresh-case');
    assert.equal(fresh.cases[0].status, 'not-run');
    assert.equal(fresh.cases[0].prompt, 'Try the fresh eval.');
    assert.equal(fresh.cases[0].setup, '{"kind":"empty"}');

    const demo = ws.skills.find((s) => s.id === 'demo');
    assert.ok(demo, 'run-bearing skill still appears');
    assert.ok(demo.runDir, 'run-bearing skill keeps newest run dir');
    assert.equal(demo.cases.length, 2);
    assert.ok(ws.runs.some((r) => r.skill === 'demo'), 'existing runs still load');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('loadWorkspace synthesizes distractor entries for --extra-skill attachments', async () => {
  const { root, skillDir } = await buildFixture();
  try {
    const shinyDir = path.join(root, 'skills', 'shiny');
    await writeJson(path.join(skillDir, 'evals-runs', 'run-1', 'eval-case-a', 'context-manifest.json'), {
      runtime: 'pi',
      mode: 'isolated',
      attached_skills: [
        { name: 'demo', path: skillDir, role: 'target' },
        { name: 'shiny', path: shinyDir, role: 'extra' },
        { name: 'demo', path: skillDir, role: 'extra' }, // already a target skill → no duplicate entry
      ],
      available_tools: [], active_tools: [], mcp_tools: [], mcp_servers: [],
      ambient: { extensions: false, skills: false, prompt_templates: false, themes: false, context_files: false },
    });

    const ws = await loadWorkspace(skillDir);

    assert.equal(ws.skills.length, 2, 'target + one synthesized distractor');
    const distractor = ws.skills.find((s) => s.role === 'distractor');
    assert.ok(distractor, 'distractor entry present');
    assert.equal(distractor.id, 'shiny');
    assert.equal(path.resolve(distractor.dir), path.resolve(shinyDir));
    assert.equal(distractor.cases.length, 0, 'distractors have no runs of their own');
    assert.equal(distractor.total, 0);
    assert.equal(ws.skills.filter((s) => s.id === 'demo').length, 1, 'target skill not duplicated by its extra attachment');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('reloadSkill returns the skill and its runs', async () => {
  const { root, skillDir } = await buildFixture();
  try {
    const { skill, runs } = await reloadSkill(skillDir);
    assert.ok(skill, 'skill reloaded');
    assert.equal(skill.id, 'demo');
    assert.ok(runs.length >= 1, 'runs reloaded');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
