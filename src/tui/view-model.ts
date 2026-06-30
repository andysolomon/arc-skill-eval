// Projection layer: turns the view-model into renderable rows + main-pane lines.
// This is a direct port of the HTML mock's renderVals() — same layout, same
// colors. Extend the per-focus branches here, not in the components.
//
// MainView.anchors holds the line indices the in-pane cursor can land on
// (assertion rows in the case view, case rows in the skill view). Views with
// no cursorable items return an empty anchors array.

import {
  COLORS, seg, pad, trunc, num, bar, wrap, statusGlyph, rateColor, deltaColor, passFrac,
} from './theme.js';
import type { Seg, Line } from './theme.js';
import type { Skill, Case, Assertion, Run, Focus } from './types.js';

const sectionRow = (label: string, extra: Seg[] = []): Line => ({ segs: [seg(pad(label, 13), COLORS.cyan, true), ...extra] });
const row = (segs: Seg[], bg?: string): Line => ({ segs, ...(bg ? { bg } : {}) });
const blank = (): Line => ({ segs: [seg(' ', COLORS.fg)] });

const typeColor = (a: Assertion): string => (a.det ? COLORS.cyan : COLORS.magenta);
const typeTag = (a: Assertion): string => (a.det ? a.type : 'judge');

// ---------------------------------------------------------------- list rows

export function skillRows(skills: Skill[]): Seg[][] {
  return skills.map((s) => {
    const [g, gc] = statusGlyph(s.passed === s.total ? 'pass' : s.passed === 0 ? 'fail' : 'partial');
    const segs = [
      seg(g + ' ', gc, true),
      seg(pad(s.id, 26), s.role === 'distractor' ? COLORS.fgDark : COLORS.fg),
      seg(`${s.passed}/${s.total}`, rateColor(s.passed, s.total)),
    ];
    if (s.role === 'distractor') segs.push(seg('  distractor', COLORS.orange));
    else if (s.delta && s.delta !== 'n/a') segs.push(seg('  ' + s.delta, deltaColor(s.delta)));
    return segs;
  });
}

export function caseRows(skill: Skill): Seg[][] {
  return skill.cases.map((c) => {
    const [g, gc] = statusGlyph(c.status);
    return [seg(g + ' ', gc, true), seg(trunc(c.id, 32), c.status === 'fail' ? COLORS.red : COLORS.fg)];
  });
}

export function assertionRows(c: Case): Seg[][] {
  return c.assertions.map((a) => {
    const [g, gc] = statusGlyph(a.passed ? 'pass' : 'fail');
    return [seg(g + ' ', gc, true), seg(pad(typeTag(a), 11), typeColor(a)), seg(trunc(a.label, 26), COLORS.fgDark)];
  });
}

export function runRows(runs: Run[]): Seg[][] {
  return runs.map((r) => {
    const [g, gc] = statusGlyph(r.exit === 0 ? 'pass' : 'fail');
    const name = r.iteration !== '—' ? r.iteration : r.runId.replace('run-', '');
    const [p, t] = passFrac(r.pass);
    const segs = [seg(g + ' ', gc, true), seg(pad(name, 16), COLORS.fg), seg(r.pass + ' ', rateColor(p, t))];
    if (r.mode === 'compare') segs.push(seg('⇄', COLORS.magenta));
    return segs;
  });
}

// ---------------------------------------------------------------- main pane

export interface MainView {
  title: string;
  sub: Seg[];
  lines: Line[];
  anchors: number[]; // cursorable line indices; index aligns to the side-panel item
}

export function buildMain(
  focus: Focus,
  sk: Skill,
  cs: Case,
  asrt: Assertion,
  run: Run | undefined,
  rawMode: boolean,
  showWithout: boolean,
): MainView {
  if (focus === 'skills') return skillView(sk, showWithout);
  if (focus === 'cases') return rawMode ? caseRawView(cs) : caseView(cs, showWithout);
  if (focus === 'assertions') return assertionView(asrt);
  return runView(run);
}

function skillView(sk: Skill, showWithout: boolean): MainView {
  const lines: Line[] = [];
  const anchors: number[] = [];
  lines.push(row([seg('role     ', COLORS.comment), seg(sk.role, sk.role === 'distractor' ? COLORS.orange : COLORS.green)]));
  lines.push(row([seg('model    ', COLORS.comment), seg(sk.model, COLORS.blue)]));
  lines.push(row([seg('judge    ', COLORS.comment), seg(sk.judge, COLORS.magenta)]));
  lines.push(blank());
  lines.push(sectionRow('CASES', [seg(`${sk.passed}/${sk.total} passed`, rateColor(sk.passed, sk.total))]));
  for (const c of sk.cases) {
    const [g, gc] = statusGlyph(c.status);
    const p = c.assertions.filter((a) => a.passed).length;
    anchors.push(lines.length); // cursor lands here; index == case index
    lines.push(row([
      seg('  ' + g + ' ', gc, true),
      seg(pad(c.id, 36), c.status === 'fail' ? COLORS.red : COLORS.fgDark),
      seg(`${p}/${c.assertions.length} assert`, COLORS.comment),
    ]));
  }
  lines.push(blank());
  lines.push(sectionRow('BENCHMARK'));
  lines.push(row([seg('  with_skill     ', COLORS.fgDark), ...bar(safeFrac(sk.withP, sk.withT), COLORS.green), seg(`  ${sk.withP}/${sk.withT}`, COLORS.green)]));
  if (showWithout) lines.push(row([seg('  without_skill  ', COLORS.fgDark), ...bar(safeFrac(sk.withoutP, sk.withoutT), COLORS.orange), seg(`  ${sk.withoutP}/${sk.withoutT}`, COLORS.orange)]));
  lines.push(row([seg('  delta          ', COLORS.fgDark), seg(sk.delta || 'n/a', deltaColor(sk.delta))]));
  lines.push(blank());
  lines.push(sectionRow('AGGREGATE'));
  lines.push(row([seg('  cost   ', COLORS.comment), seg(sk.totalCost, COLORS.green), seg('     tokens ', COLORS.comment), seg(num(sk.totalTokens), COLORS.fgDark), seg('     avg ', COLORS.comment), seg(sk.avgDur, COLORS.fgDark)]));
  return {
    title: sk.id,
    sub: [seg(`${sk.passed}/${sk.total} passed`, rateColor(sk.passed, sk.total)), seg('   ' + (sk.delta || sk.role), sk.delta ? deltaColor(sk.delta) : COLORS.orange)],
    lines,
    anchors,
  };
}

function caseView(cs: Case, showWithout: boolean): MainView {
  const passN = cs.assertions.filter((a) => a.passed).length;
  const ctxUsed = (cs.ttot / 1000).toFixed(1) + 'k';
  const lines: Line[] = [];
  const anchors: number[] = [];
  lines.push(sectionRow('PROMPT'));
  lines.push(...wrap(cs.prompt, 70));
  lines.push(blank());
  lines.push(sectionRow('EXPECTED'));
  lines.push(...wrap(cs.expected, 70));
  lines.push(row([seg('  setup  ', COLORS.comment), seg(cs.setup, COLORS.teal)]));
  lines.push(blank());
  lines.push(sectionRow('GRADING', [seg(`${passN}/${cs.assertions.length} passed`, rateColor(passN, cs.assertions.length)), seg(`   pass_rate ${safeFrac(passN, cs.assertions.length).toFixed(2)}`, COLORS.comment)]));
  for (const a of cs.assertions) {
    const [g, gc] = statusGlyph(a.passed ? 'pass' : 'fail');
    anchors.push(lines.length); // cursor lands on the assertion header; index == assertion index
    lines.push(row([seg('  ' + g + ' ', gc, true), seg(pad(typeTag(a), 11), typeColor(a)), seg(a.label + (a.target ? '  → ' + a.target : ''), COLORS.fg)]));
    lines.push(row([seg('      ', COLORS.fg), seg(trunc(a.evidence, 62), a.passed ? COLORS.comment : COLORS.red)]));
  }
  lines.push(blank());
  lines.push(sectionRow('METRICS'));
  lines.push(row([seg('  model     ', COLORS.comment), seg(cs.model, COLORS.blue)]));
  lines.push(row([seg('  duration  ', COLORS.comment), seg(cs.dur, COLORS.fgDark), seg('     cost ', COLORS.comment), seg(cs.cost, COLORS.green)]));
  lines.push(row([seg('  tokens    ', COLORS.comment), seg(num(cs.ttot), COLORS.fgDark), seg(`   in ${num(cs.tin)} · out ${num(cs.tout)} · cache ${cs.cr}/${cs.cw}`, COLORS.dim)]));
  lines.push(row([seg('  context   ', COLORS.comment), ...bar(cs.ctxPct / 100, cs.ctxPct > 80 ? COLORS.red : COLORS.cyan), seg(`  ${cs.ctxPct}%  `, COLORS.cyan), seg(`(${ctxUsed} / ${cs.ctxWin / 1000}k)`, COLORS.dim)]));
  lines.push(blank());
  lines.push(sectionRow('TOOLS'));
  lines.push(row([seg('  ', COLORS.fg), seg(cs.tools.reduce((a, t) => a + t[1], 0) + ' calls', COLORS.fgDark), seg(` · ${cs.toolErr} errors    `, cs.toolErr ? COLORS.red : COLORS.comment), ...cs.tools.flatMap((t) => [seg(t[0], COLORS.yellow), seg(`×${t[1]}  `, COLORS.comment)])]));
  lines.push(row([seg('  skill reads  ', COLORS.comment), seg(cs.skillReads, COLORS.magenta)]));
  lines.push(row([seg('  external ', COLORS.comment), seg(String(cs.ext), COLORS.fgDark), seg('  ·  mcp ', COLORS.comment), seg(String(cs.mcp), COLORS.fgDark)]));
  lines.push(blank());
  lines.push(sectionRow('COMPARE', [seg(cs.delta ? 'Δ ' + cs.delta : 'single-run', deltaColor(cs.delta))]));
  lines.push(row([seg('  with_skill     ', COLORS.fgDark), ...bar(safeFrac(cs.withP, cs.withT), COLORS.green), seg(`  ${cs.withP}/${cs.withT}`, COLORS.green)]));
  if (showWithout && cs.delta) lines.push(row([seg('  without_skill  ', COLORS.fgDark), ...bar(safeFrac(cs.withoutP, cs.withoutT), COLORS.orange), seg(`  ${cs.withoutP}/${cs.withoutT}`, COLORS.orange)]));
  return {
    title: cs.id,
    sub: [
      seg(cs.status === 'pass' ? '✓ pass' : cs.status === 'fail' ? '✗ fail' : '◐ partial', cs.status === 'pass' ? COLORS.green : cs.status === 'fail' ? COLORS.red : COLORS.orange),
      seg(`   ${passN}/${cs.assertions.length}`, COLORS.comment),
    ],
    lines,
    anchors,
  };
}

function caseRawView(cs: Case): MainView {
  const passN = cs.assertions.filter((a) => a.passed).length;
  const failN = cs.assertions.length - passN;
  const rate = safeFrac(passN, cs.assertions.length).toFixed(2);
  const kv = (ind: string, key: string, val: string, vc: string): Line => row([seg(ind, COLORS.fg), seg(`"${key}"`, COLORS.yellow), seg(': ', COLORS.comment), seg(val, vc)]);
  const lines: Line[] = [
    row([seg('grading.json', COLORS.comment), seg('   (v for rendered view)', COLORS.dim)]),
    blank(),
    row([seg('{', COLORS.comment)]),
    kv('  ', 'case_id', `"${cs.id}",`, COLORS.green),
    row([seg('  ', COLORS.fg), seg('"assertion_results"', COLORS.yellow), seg(': [', COLORS.comment)]),
    ...cs.assertions.flatMap((a) => [
      row([seg('    {', COLORS.comment)]),
      kv('      ', 'passed', String(a.passed) + ',', a.passed ? COLORS.green : COLORS.red),
      kv('      ', 'type', `"${a.type}",`, COLORS.cyan),
      kv('      ', 'evidence', `"${trunc(a.evidence, 48)}"`, COLORS.fgDark),
      row([seg('    },', COLORS.comment)]),
    ]),
    row([seg('  ],', COLORS.comment)]),
    row([seg('  ', COLORS.fg), seg('"summary"', COLORS.yellow), seg(': { ', COLORS.comment), seg('"passed"', COLORS.yellow), seg(': ', COLORS.comment), seg(passN + ', ', COLORS.green), seg('"failed"', COLORS.yellow), seg(': ', COLORS.comment), seg(failN + ', ', failN ? COLORS.red : COLORS.fgDark), seg('"total"', COLORS.yellow), seg(': ', COLORS.comment), seg(cs.assertions.length + ', ', COLORS.fgDark), seg('"pass_rate"', COLORS.yellow), seg(': ', COLORS.comment), seg(rate, COLORS.cyan), seg(' }', COLORS.comment)]),
    row([seg('}', COLORS.comment)]),
  ];
  return { title: cs.id, sub: [seg('raw grading.json', COLORS.dim)], lines, anchors: [] };
}

function assertionView(a: Assertion): MainView {
  const recolor = (ls: Line[], c: string): Line[] => ls.map((l) => ({ ...l, segs: l.segs.map((s) => ({ ...s, c })) }));
  const lines: Line[] = [];
  const anchors: number[] = [];
  anchors.push(lines.length);
  lines.push(row([seg('type      ', COLORS.comment), seg(a.type, typeColor(a)), seg(a.det ? '   (deterministic)' : '   (LLM-judge)', COLORS.dim)]));
  lines.push(row([seg('target    ', COLORS.comment), seg(a.target || '—', COLORS.fgDark)]));
  lines.push(row([seg('result    ', COLORS.comment), seg(a.passed ? '✓ passed' : '✗ failed', a.passed ? COLORS.green : COLORS.red, true)]));
  lines.push(blank());
  anchors.push(lines.length);
  lines.push(sectionRow('CLAIM'));
  lines.push(...wrap(a.label, 70));
  lines.push(blank());
  anchors.push(lines.length);
  lines.push(sectionRow('EVIDENCE'));
  lines.push(...recolor(wrap(a.evidence, 70), a.passed ? COLORS.fgDark : COLORS.red));
  lines.push(blank());
  anchors.push(lines.length);
  lines.push(sectionRow('SOURCE', [seg('evals.json', COLORS.dim)]));
  lines.push(...recolor(wrap(a.raw, 70), COLORS.teal));
  return { title: typeTag(a) + ' assertion', sub: [seg(a.passed ? '✓ passed' : '✗ failed', a.passed ? COLORS.green : COLORS.red)], lines, anchors };
}

function runView(r: Run | undefined): MainView {
  if (!r) return { title: 'Runs', sub: [], lines: [row([seg('  no runs found under evals-runs/', COLORS.dim)])], anchors: [] };
  const [p, t] = passFrac(r.pass);
  const cmd = [`arc-skill-eval run ./skills/${r.skill}`];
  if (r.caseFilter) cmd.push(`--case ${r.caseFilter}`);
  if (r.mode === 'compare') cmd.push('--compare');
  if (r.extra) cmd.push(`--extra-skill ./skills/${r.extra}`);
  if (r.ctxMode === 'ambient') cmd.push('--context-mode ambient');
  if (r.iteration !== '—') cmd.push(`--iteration ${r.iteration}`);
  if (r.model !== '—') cmd.push(`--model ${r.model}`);
  if (r.judge !== '—') cmd.push(`--judge-model ${r.judge}`);
  const lines: Line[] = [];
  const anchors: number[] = [];
  anchors.push(lines.length);
  lines.push(row([seg('runId     ', COLORS.comment), seg(r.runId, COLORS.yellow)]));
  lines.push(row([seg('when      ', COLORS.comment), seg(r.when, COLORS.fgDark)]));
  lines.push(row([seg('mode      ', COLORS.comment), seg(r.mode, r.mode === 'compare' ? COLORS.magenta : COLORS.fgDark)]));
  lines.push(row([seg('skill     ', COLORS.comment), seg(r.skill, COLORS.fg)]));
  lines.push(row([seg('model     ', COLORS.comment), seg(r.model, COLORS.blue)]));
  lines.push(row([seg('judge     ', COLORS.comment), seg(r.judge, COLORS.magenta)]));
  lines.push(row([seg('context   ', COLORS.comment), seg(r.ctxMode, COLORS.teal), ...(r.extra ? [seg('   +extra ', COLORS.comment), seg(r.extra, COLORS.orange)] : [])]));
  lines.push(blank());
  anchors.push(lines.length);
  lines.push(sectionRow('COMMAND'));
  lines.push(row([seg('  $ ', COLORS.green), seg(cmd[0] ?? '', COLORS.fg)]));
  for (const part of cmd.slice(1)) lines.push(row([seg('      ', COLORS.fg), seg(part, COLORS.fgDark)]));
  lines.push(blank());
  anchors.push(lines.length);
  lines.push(sectionRow('RESULT'));
  lines.push(row([seg('  exit code  ', COLORS.comment), seg(String(r.exit), r.exit === 0 ? COLORS.green : COLORS.red, true), seg(r.exit === 0 ? '  all assertions passed' : '  ≥1 assertion failed', COLORS.dim)]));
  lines.push(row([seg('  cases      ', COLORS.comment), seg(r.pass, rateColor(p, t))]));
  if (r.delta) lines.push(row([seg('  delta      ', COLORS.comment), seg(r.delta, deltaColor(r.delta))]));
  lines.push(blank());
  anchors.push(lines.length);
  lines.push(sectionRow('OUTPUT'));
  lines.push(row([seg('  ', COLORS.fg), seg(`./skills/${r.skill}/evals-runs/${r.iteration !== '—' ? 'iteration-' + r.iteration + '/' : ''}${r.runId}/`, COLORS.teal)]));
  lines.push(r.mode === 'compare'
    ? row([seg('  ', COLORS.fg), seg('benchmark.json', COLORS.yellow), seg('  ·  with_skill/ + without_skill/ per case', COLORS.dim)])
    : row([seg('  ', COLORS.fg), seg('grading.json · timing.json · trace.json · tool-summary.json', COLORS.dim)]));
  return { title: r.iteration !== '—' ? r.iteration : r.runId, sub: [seg(`${r.pass} passed`, rateColor(p, t)), seg('   ' + r.cost, COLORS.green)], lines, anchors };
}

function safeFrac(p: number, t: number): number {
  return t > 0 ? p / t : 0;
}
