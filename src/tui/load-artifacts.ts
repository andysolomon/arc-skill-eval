// Maps real evals-runs/ artifacts into the TUI view-model.
// This is the integration seam: the documented artifact JSON shapes
// (grading.json / timing.json / tool-summary.json / benchmark.json / evals.json)
// in, view-model out. Swap discoverSkillDirs() for the repo's own
// discoverEvalSkills() (src/evals/discover.ts) once you wire this into src/.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { Workspace, Skill, Case, Assertion, Run, CaseStatus, TraceInfo, ContextInfo, OutputFile } from './types.js';

// ---------------------------------------------------------------- fs helpers

async function readJson<T = unknown>(p: string): Promise<T | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf8')) as T; } catch { return null; }
}
async function readText(p: string): Promise<string> {
  try { return await fs.readFile(p, 'utf8'); } catch { return ''; }
}
async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}
async function listDirs(p: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch { return []; }
}

/** Recursively list files under outputs/ (relative paths + sizes), capped. */
async function listOutputFiles(dir: string, cap = 200): Promise<OutputFile[]> {
  const out: OutputFile[] = [];
  async function walk(d: string, rel: string): Promise<void> {
    if (out.length >= cap) return;
    let entries: import('node:fs').Dirent[];
    try { entries = await fs.readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (out.length >= cap) return;
      const full = path.join(d, e.name);
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) await walk(full, r);
      else {
        let size = 0;
        try { size = (await fs.stat(full)).size; } catch { /* ignore */ }
        out.push({ path: r, size });
      }
    }
  }
  await walk(dir, '');
  out.sort((a, b) => (a.path < b.path ? -1 : 1));
  return out;
}

// ---------------------------------------------------------------- formatting

const ms = (d: number): string => (d >= 1000 ? (d / 1000).toFixed(1) + 's' : Math.round(d) + 'ms');
const money4 = (n: number): string => '$' + (n || 0).toFixed(4);
const money2 = (n: number): string => '$' + (n || 0).toFixed(2);
const pct = (n: number): string => ((n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%');

function relTime(mtimeMs: number): string {
  const s = Math.max(0, (Date.now() - mtimeMs) / 1000);
  if (s < 90) return Math.round(s) + 's ago';
  if (s < 5400) return Math.round(s / 60) + 'm ago';
  if (s < 129600) return Math.round(s / 3600) + 'h ago';
  return Math.round(s / 86400) + 'd ago';
}

// ---------------------------------------------------------------- mapping

const DET_TYPES = new Set(['file-exists', 'regex-match', 'json-valid']);

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapAssertion(r: any): Assertion {
  const a = r?.assertion;
  const isStr = typeof a === 'string';
  let type = 'llm-judge';
  let det = false;
  let target = '';
  if (!isStr && a && typeof a === 'object') {
    if (typeof a.type === 'string') { type = a.type; det = DET_TYPES.has(a.type); }
    else if (a.kind && a.method) { type = `${a.kind}/${a.method}`; det = a.method !== 'judge'; }
    const tgt = a.path ?? (a.target && (a.target.file ?? a.target));
    target = typeof tgt === 'string' ? tgt : '';
  }
  return {
    type, det,
    label: String(r?.text ?? ''),
    target,
    passed: !!r?.passed,
    evidence: String(r?.evidence ?? ''),
    raw: a === undefined ? '' : JSON.stringify(a),
  };
}

function modelStr(timing: any): string {
  const m = timing?.model;
  if (!m) return '—';
  return `${m.provider}/${m.id}${m.thinking ? ':' + m.thinking : ''}`;
}

// grading.json carries judge_model only when an LLM-judge actually ran for the case.
function judgeStr(grading: any): string {
  const j = grading?.judge_model;
  if (!j) return '—';
  if (typeof j === 'string') return j;
  return j.provider && j.id ? `${j.provider}/${j.id}` : '—';
}

function deriveStatus(passed: number, total: number): CaseStatus {
  const failed = total - passed;
  if (failed <= 0) return 'pass';
  return passed > 0 ? 'partial' : 'fail';
}

function formatSetup(ec: any): string {
  return ec?.setup ? JSON.stringify(ec.setup) : Array.isArray(ec?.files) ? 'seeded · ' + ec.files.join(', ') : 'empty';
}

function unloadedCase(ec: any): Case {
  return {
    id: String(ec?.id ?? ''),
    status: 'not-run',
    prompt: String(ec?.prompt ?? ''),
    expected: String(ec?.expected_output ?? ''),
    setup: formatSetup(ec),
    model: '—',
    judge: '—',
    dur: '—',
    tin: 0,
    tout: 0,
    cr: 0,
    cw: 0,
    ttot: 0,
    cost: money4(0),
    ctxWin: 0,
    ctxPct: 0,
    tools: [],
    toolErr: 0,
    skillReads: '—',
    ext: 0,
    mcp: 0,
    withP: 0,
    withT: 0,
    withoutP: 0,
    withoutT: 0,
    delta: '',
    assistant: '',
    assistantWithout: '',
    trace: buildTrace(null),
    context: buildContext(null),
    outputs: [],
    assertions: [],
  };
}

function buildTrace(tools: any): TraceInfo {
  return {
    callCount: tools?.tool_call_count ?? 0,
    errors: tools?.tool_error_count ?? 0,
    fileTouches: tools?.file_touch_count ?? 0,
    bashCount: tools?.bash_command_count ?? 0,
    toolCalls: Object.entries(tools?.tool_calls_by_name ?? {}).map(([k, v]) => [k, Number(v)] as [string, number]),
    skillReads: Object.entries(tools?.skill_reads_by_name ?? {}).map(([k, v]) => [k, Number(v)] as [string, number]),
    writtenFiles: Array.isArray(tools?.written_files) ? tools.written_files.map(String) : [],
    editedFiles: Array.isArray(tools?.edited_files) ? tools.edited_files.map(String) : [],
    externalCalls: Array.isArray(tools?.external_calls)
      ? tools.external_calls.map((c: any) => ({ system: String(c?.system ?? ''), operation: String(c?.operation ?? ''), ...(c?.target ? { target: String(c.target) } : {}) }))
      : [],
  };
}

function buildContext(m: any): ContextInfo {
  return {
    mode: String(m?.mode ?? 'isolated'),
    agentDir: m?.agent_dir ? String(m.agent_dir) : '',
    attachedSkills: Array.isArray(m?.attached_skills) ? m.attached_skills.map((s: any) => ({ name: String(s?.name ?? ''), path: String(s?.path ?? ''), role: String(s?.role ?? '') })) : [],
    activeTools: Array.isArray(m?.active_tools) ? m.active_tools.map(String) : [],
    availableTools: Array.isArray(m?.available_tools) ? m.available_tools.map((t: any) => ({ name: String(t?.name ?? ''), source: String(t?.source ?? '') })) : [],
    mcpTools: Array.isArray(m?.mcp_tools) ? m.mcp_tools.map((t: any) => String(t?.name ?? t)) : [],
    mcpServers: Array.isArray(m?.mcp_servers) ? m.mcp_servers.map(String) : [],
    ambient: m?.ambient && typeof m.ambient === 'object' ? m.ambient : {},
  };
}

async function loadCase(caseDir: string, ec: any): Promise<Case> {
  const compare = await exists(path.join(caseDir, 'with_skill'));
  const base = compare ? path.join(caseDir, 'with_skill') : caseDir;

  const grading = await readJson<any>(path.join(base, 'grading.json'));
  const timing = await readJson<any>(path.join(base, 'timing.json'));
  const tools = await readJson<any>(path.join(base, 'tool-summary.json'));
  const manifest = await readJson<any>(path.join(base, 'context-manifest.json'));
  const assistant = await readText(path.join(base, 'assistant.md'));
  const assistantWithout = compare ? await readText(path.join(caseDir, 'without_skill', 'assistant.md')) : '';
  const outputs = await listOutputFiles(path.join(base, 'outputs'));

  const assertions: Assertion[] = (grading?.assertion_results ?? []).map(mapAssertion);
  const passed = grading?.summary?.passed ?? assertions.filter((a) => a.passed).length;
  const total = grading?.summary?.total ?? assertions.length;

  let withP = passed, withT = total, withoutP = passed, withoutT = total, delta = '';
  if (compare) {
    const wo = await readJson<any>(path.join(caseDir, 'without_skill', 'grading.json'));
    withoutP = wo?.summary?.passed ?? 0;
    withoutT = wo?.summary?.total ?? total;
    delta = pct((withT ? withP / withT : 0) - (withoutT ? withoutP / withoutT : 0));
  }

  const tu = timing?.token_usage ?? {};
  const toolPairs: [string, number][] = Object.entries(tools?.tool_calls_by_name ?? {}).map(([k, v]) => [k, Number(v)]);
  const skillReads = Object.entries(tools?.skill_reads_by_name ?? {}).map(([k, v]) => `${k} ×${v}`).join(', ') || '—';

  return {
    id: String(ec?.id ?? path.basename(caseDir).replace(/^eval-/, '')),
    status: deriveStatus(passed, total),
    prompt: String(ec?.prompt ?? ''),
    expected: String(ec?.expected_output ?? ''),
    setup: formatSetup(ec),
    model: modelStr(timing),
    judge: judgeStr(grading),
    dur: timing ? ms(timing.duration_ms ?? 0) : '—',
    tin: tu.input_tokens ?? 0,
    tout: tu.output_tokens ?? 0,
    cr: tu.cache_read_tokens ?? 0,
    cw: tu.cache_write_tokens ?? 0,
    ttot: timing?.total_tokens ?? tu.total_tokens ?? 0,
    cost: money4(timing?.estimated_cost_usd ?? 0),
    ctxWin: timing?.context_window_tokens ?? 0,
    ctxPct: timing?.context_window_used_percent ?? 0,
    tools: toolPairs,
    toolErr: tools?.tool_error_count ?? 0,
    skillReads,
    ext: tools?.external_call_count ?? 0,
    mcp: tools?.mcp_tool_call_count ?? 0,
    withP, withT, withoutP, withoutT, delta,
    assistant,
    assistantWithout,
    trace: buildTrace(tools),
    context: buildContext(manifest),
    outputs,
    assertions,
  };
}

/** Newest run directory for a skill (handles `iteration-<n>/<runId>/` buckets). */
async function runDirsFor(skillDir: string): Promise<string[]> {
  const root = path.join(skillDir, 'evals-runs');
  if (!(await exists(root))) return [];
  const out: string[] = [];
  for (const name of await listDirs(root)) {
    const full = path.join(root, name);
    if (name.startsWith('iteration-')) {
      for (const r of await listDirs(full)) out.push(path.join(full, r));
    } else {
      out.push(full);
    }
  }
  // keep only dirs that actually contain eval-* case dirs
  const valid: string[] = [];
  for (const d of out) {
    if ((await listDirs(d)).some((n) => n.startsWith('eval-'))) valid.push(d);
  }
  return valid;
}

async function mtime(p: string): Promise<number> {
  try { return (await fs.stat(p)).mtimeMs; } catch { return 0; }
}

async function loadSkill(skillDir: string): Promise<Skill | null> {
  const evals = await readJson<any>(path.join(skillDir, 'evals', 'evals.json'));
  const runDirs = await runDirsFor(skillDir);
  if (runDirs.length === 0) {
    if (!evals) return null;
    const cases = (evals.evals ?? []).map(unloadedCase);
    return {
      id: String(evals.skill_name ?? path.basename(skillDir)),
      dir: path.resolve(skillDir),
      runDir: '',
      role: 'target',
      model: '—',
      judge: '—',
      passed: 0,
      total: 0,
      withP: 0, withT: 0, withoutP: 0, withoutT: 0, delta: '',
      totalCost: money2(0),
      totalTokens: 0,
      avgDur: '—',
      cases,
    };
  }

  // newest run wins for the detail view
  let runDir = runDirs[0]!;
  let best = -1;
  for (const d of runDirs) { const t = await mtime(d); if (t > best) { best = t; runDir = d; } }

  const evalById = new Map<string, any>((evals?.evals ?? []).map((e: any) => [String(e.id), e]));
  const caseDirs = (await listDirs(runDir)).filter((n) => n.startsWith('eval-'));
  const cases: Case[] = [];
  for (const cd of caseDirs) {
    const id = cd.replace(/^eval-/, '');
    cases.push(await loadCase(path.join(runDir, cd), evalById.get(id)));
  }

  const passed = cases.filter((c) => c.status === 'pass').length;
  const totalTokens = cases.reduce((a, c) => a + c.ttot, 0);
  const totalCost = cases.reduce((a, c) => a + (parseFloat(c.cost.replace('$', '')) || 0), 0);
  const withP = cases.reduce((a, c) => a + c.withP, 0);
  const withT = cases.reduce((a, c) => a + c.withT, 0);
  const woP = cases.reduce((a, c) => a + c.withoutP, 0);
  const woT = cases.reduce((a, c) => a + c.withoutT, 0);
  const compare = cases.some((c) => c.delta !== '');
  const delta = compare ? pct((withT ? withP / withT : 0) - (woT ? woP / woT : 0)) : '';

  const first = cases[0];
  return {
    id: String(evals?.skill_name ?? path.basename(skillDir)),
    dir: path.resolve(skillDir),
    runDir: path.resolve(runDir),
    role: 'target', // a skill with its own runs is a target; --extra-skill distractors are appended by appendDistractorSkills()
    model: first?.model ?? '—',
    judge: first?.judge ?? '—',
    passed,
    total: cases.length,
    withP, withT, withoutP: woP, withoutT: woT, delta,
    totalCost: money2(totalCost),
    totalTokens,
    avgDur: first?.dur ?? '—',
    cases,
  };
}

async function aggregateRun(dir: string): Promise<{ pass: string; exit: number; cost: number }> {
  const caseDirs = (await listDirs(dir)).filter((n) => n.startsWith('eval-'));
  let cp = 0; let exit = 0; let cost = 0;
  for (const cd of caseDirs) {
    const hasCompare = await exists(path.join(dir, cd, 'with_skill'));
    const base = hasCompare ? path.join(dir, cd, 'with_skill') : path.join(dir, cd);
    const g = await readJson<any>(path.join(base, 'grading.json'));
    const failed = g?.summary?.failed ?? 1;
    if (failed === 0) cp++; else exit = 1;
    const t = await readJson<any>(path.join(base, 'timing.json'));
    cost += Number(t?.estimated_cost_usd ?? 0);
    if (hasCompare) {
      const t2 = await readJson<any>(path.join(dir, cd, 'without_skill', 'timing.json'));
      cost += Number(t2?.estimated_cost_usd ?? 0);
    }
  }
  return { pass: `${cp}/${caseDirs.length}`, exit, cost };
}

async function loadRuns(skillDir: string): Promise<Run[]> {
  const out: Run[] = [];
  for (const dir of await runDirsFor(skillDir)) {
    const benchmark = await readJson<any>(path.join(dir, 'benchmark.json'));
    const mode: Run['mode'] = benchmark ? 'compare' : 'single';
    const { pass, exit, cost } = await aggregateRun(dir);
    const rel = path.relative(path.join(skillDir, 'evals-runs'), dir);
    const segments = rel.split(path.sep);
    const iteration = segments[0]?.startsWith('iteration-') ? segments[0].replace('iteration-', '') : '—';
    const runId = segments[segments.length - 1] ?? rel;
    // peek one case's with_skill (or single) artifacts for model + context
    const firstCase = (await listDirs(dir)).find((n) => n.startsWith('eval-'));
    const tBase = firstCase ? ((await exists(path.join(dir, firstCase, 'with_skill'))) ? path.join(dir, firstCase, 'with_skill') : path.join(dir, firstCase)) : '';
    const timing = tBase ? await readJson<any>(path.join(tBase, 'timing.json')) : null;
    const manifest = tBase ? await readJson<any>(path.join(tBase, 'context-manifest.json')) : null;
    const grading = tBase ? await readJson<any>(path.join(tBase, 'grading.json')) : null;
    const extras = Array.isArray(manifest?.attached_skills)
      ? manifest.attached_skills.filter((s: any) => s?.role === 'extra').map((s: any) => String(s?.name))
      : [];
    out.push({
      iteration,
      runId,
      mode,
      skill: path.basename(skillDir),
      extra: extras.join(', '),
      ctxMode: String(manifest?.mode ?? 'isolated'),
      model: modelStr(timing),
      judge: judgeStr(grading),
      when: relTime(await mtime(dir)),
      pass,
      delta: benchmark?.summary?.delta != null ? pct(Number(benchmark.summary.delta)) : '',
      cost: money2(cost),
      exit,
      caseFilter: '',
    });
  }
  out.sort((a, b) => (a.when < b.when ? -1 : 1));
  return out;
}

/** Shallow walk for directories that ship evals/evals.json (depth-limited). */
async function discoverSkillDirs(root: string, depth = 3): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, d: number): Promise<void> {
    if (await exists(path.join(dir, 'evals', 'evals.json'))) { found.push(dir); return; }
    if (d <= 0) return;
    for (const name of await listDirs(dir)) {
      if (name.startsWith('.') || name === 'node_modules' || name === 'evals-runs') continue;
      await walk(path.join(dir, name), d - 1);
    }
  }
  await walk(root, depth);
  return found;
}

/**
 * Skills attached via --extra-skill never get runs of their own, so loadSkill()
 * can't surface them. Synthesize a Skills-panel entry for each unique `extra`
 * attachment found in the loaded cases' context manifests.
 */
function appendDistractorSkills(skills: Skill[]): void {
  const known = new Set<string>();
  for (const s of skills) { known.add(s.dir); known.add(s.id); }

  const extras = new Map<string, { name: string; dir: string }>();
  for (const s of skills) {
    for (const c of s.cases) {
      for (const a of c.context.attachedSkills) {
        if (a.role !== 'extra') continue;
        const dir = a.path ? path.resolve(a.path) : '';
        const name = a.name || (dir ? path.basename(dir) : '');
        const key = dir || name;
        if (!key || known.has(name) || (dir && known.has(dir))) continue;
        if (!extras.has(key)) extras.set(key, { name, dir });
      }
    }
  }

  for (const e of extras.values()) {
    skills.push({
      id: e.name,
      dir: e.dir,
      runDir: '',
      role: 'distractor',
      model: '—',
      judge: '—',
      passed: 0,
      total: 0,
      withP: 0, withT: 0, withoutP: 0, withoutT: 0, delta: '',
      totalCost: money2(0),
      totalTokens: 0,
      avgDur: '—',
      cases: [],
    });
  }
}

/** Reload a single skill + its runs after a re-run (cheaper than loadWorkspace). */
export async function reloadSkill(skillDir: string): Promise<{ skill: Skill | null; runs: Run[] }> {
  const skill = await loadSkill(skillDir);
  const runs = await loadRuns(skillDir);
  return { skill, runs };
}

export async function loadWorkspace(input: string): Promise<Workspace> {
  const abs = path.resolve(input);

  // single skill directory
  if (await exists(path.join(abs, 'evals', 'evals.json'))) {
    const sk = await loadSkill(abs);
    const runs = await loadRuns(abs);
    const skills = sk ? [sk] : [];
    appendDistractorSkills(skills);
    return { skills, runs };
  }

  // repo root: discover skill dirs
  const skills: Skill[] = [];
  const runs: Run[] = [];
  for (const dir of await discoverSkillDirs(abs)) {
    const sk = await loadSkill(dir);
    if (sk) skills.push(sk);
    for (const r of await loadRuns(dir)) runs.push(r);
  }
  appendDistractorSkills(skills);
  return { skills, runs };
}
