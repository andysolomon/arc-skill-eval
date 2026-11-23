import { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { Key } from 'ink';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { COLORS, NO_COLOR, segLen, pad, trunc } from './theme.js';
import { GLYPHS, BORDER } from './caps.js';
import { seg } from './theme.js';
import type { Seg } from './theme.js';
import type { Skill, Run, Case, Focus, Sel, CaseMode } from './types.js';
import { skillRows, caseRows, assertionRows, runRows, buildMain, modesFor } from './view-model.js';
import { useRunController, RunConsole } from './RunConsole.js';
import { NewCaseForm } from './NewCaseForm.js';
import { CreateForm } from './CreateForm.js';
import { RunOptionsForm } from './RunOptionsForm.js';
import { KEYMAP } from './keymap.js';

type SortMode = 'name' | 'pass' | 'delta' | 'cost';

const matchStr = (s: string, q: string): boolean => s.toLowerCase().includes(q.toLowerCase());
const deltaNum = (d: string): number => { const m = /-?\d+(\.\d+)?/.exec(d); return m ? Number(m[0]) : -Infinity; };
const costNum = (c: string): number => { const m = /-?\d+(\.\d+)?/.exec(c); return m ? Number(m[0]) : 0; };

function applySkillView(skills: Skill[], filter: string, failOnly: boolean, sortMode: SortMode): Skill[] {
  let v = skills;
  if (failOnly) v = v.filter((s) => s.passed < s.total);
  if (filter) v = v.filter((s) => matchStr(s.id, filter) || s.cases.some((c) => matchStr(c.id, filter)));
  const by = [...v];
  if (sortMode === 'pass') by.sort((a, b) => a.passed / Math.max(1, a.total) - b.passed / Math.max(1, b.total));
  else if (sortMode === 'delta') by.sort((a, b) => deltaNum(b.delta) - deltaNum(a.delta));
  else if (sortMode === 'cost') by.sort((a, b) => costNum(b.totalCost) - costNum(a.totalCost));
  else by.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return by;
}
function applyCaseView(cases: Case[], filter: string, failOnly: boolean): Case[] {
  let v = cases;
  if (failOnly) v = v.filter((c) => c.status !== 'pass');
  if (filter) { const m = v.filter((c) => matchStr(c.id, filter)); v = m.length ? m : v; }
  return v;
}

/**
 * Printable text from one input event, or '' for a control key. Ink delivers
 * a paste as a single event with the whole string, so this keeps every
 * character, not only one. Line breaks and tabs become spaces, and the
 * bracketed-paste markers and other control characters are dropped.
 */
function typedText(input: string, key: Key): string {
  if (!input || key.ctrl || (key.meta && input.length === 1)) return '';
  return input
    .replace(/\x1b?\[20[01]~/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[\x00-\x1f\x7f]/g, '');
}

/** Write/merge a feedback.json note matching the schema `improve` consumes. */
async function writeFeedback(skill: Skill, caseId: string, note: string): Promise<string> {
  if (!skill.runDir) throw new Error(`${skill.id} has no run directory`);
  const fpath = path.join(skill.runDir, 'feedback.json');
  let doc: any = null;
  try { doc = JSON.parse(await fs.readFile(fpath, 'utf8')); } catch { doc = null; }
  if (!doc || !Array.isArray(doc.cases)) {
    doc = {
      schema_version: '1',
      run_dir: skill.runDir,
      compare: skill.cases.some((c) => c.delta !== ''),
      cases: skill.cases.map((c) => ({ case_id: c.id, status: 'needs-review', notes: '', variants: [] })),
    };
  }
  let entry = doc.cases.find((c: any) => c.case_id === caseId);
  if (!entry) { entry = { case_id: caseId, status: 'needs-review', notes: '', variants: [] }; doc.cases.push(entry); }
  entry.notes = note;
  entry.status = 'reviewed';
  await fs.writeFile(fpath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return fpath;
}

const ORDER: Focus[] = ['skills', 'cases', 'assertions', 'runs'];

/** UI state the controller can restore after a re-run remounts the App. */
export interface AppState {
  focused: Focus;
  sel: Sel;
  caseMode: CaseMode;
}

/** Actions the App hands back to the controller loop (browse-command.ts). */
export type AppAction =
  | { type: 'quit'; state?: AppState }
  | { type: 'rerun'; skillDir: string; caseId: string | null; state: AppState; compare?: boolean; extraArgs?: string };

const clampIdx = (i: number, len: number): number => Math.max(0, Math.min(Math.max(0, len - 1), i));

interface DisplayLine { segs: Seg[]; bg?: string }
interface TerminalSize { cols: number; rows: number }

function readTerminalSize(stdout?: NodeJS.WriteStream): TerminalSize {
  return { cols: stdout?.columns ?? 120, rows: stdout?.rows ?? 40 };
}

function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout();
  const [size, setSize] = useState<TerminalSize>(() => readTerminalSize(stdout));

  useEffect(() => {
    const update = () => {
      const next = readTerminalSize(stdout);
      setSize((prev) => (prev.cols === next.cols && prev.rows === next.rows ? prev : next));
    };

    update();
    stdout?.on('resize', update);
    return () => { stdout?.off('resize', update); };
  }, [stdout]);

  return size;
}

// ------------------------------------------------------------------ rows

function RowList({ rows, selected, focused, width, maxRows }: { rows: Seg[][]; selected: number; focused: boolean; width: number; maxRows: number }) {
  const total = rows.length;
  const overflow = maxRows > 0 && total > maxRows;
  let start = 0;
  if (overflow) {
    start = Math.min(Math.max(0, selected - Math.floor(maxRows / 2)), total - maxRows);
    if (selected < start) start = selected;
    if (selected >= start + maxRows) start = selected - maxRows + 1;
  }
  const slice = overflow ? rows.slice(start, start + maxRows) : rows;
  return (
    <>
      {slice.map((segs, idx) => {
        const i = overflow ? start + idx : idx;
        const sel = i === selected;
        const bg = sel ? (focused ? COLORS.selection : COLORS.bgHi) : undefined;
        const accent = focused && sel ? GLYPHS.accent : ' ';
        const more = overflow && idx === 0 && start > 0 ? GLYPHS.up : overflow && idx === maxRows - 1 && start + maxRows < total ? GLYPHS.down : null;
        const fill = ' '.repeat(Math.max(0, width - segLen(segs) - 1 - (more ? 1 : 0)));
        return (
          <Text key={i} wrap="truncate" backgroundColor={bg} inverse={NO_COLOR && sel}>
            <Text color={COLORS.blue} backgroundColor={bg}>{accent}</Text>
            {segs.map((s, j) => (
              <Text key={j} color={s.c} bold={s.b} backgroundColor={bg}>{s.t}</Text>
            ))}
            <Text backgroundColor={bg}>{fill}</Text>
            {more ? <Text color={COLORS.dim} backgroundColor={bg}>{more}</Text> : null}
          </Text>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------ panel

/** Split `total` rows by `weights` into whole numbers that sum to `total`, each at least 3. */
function splitRows(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, w) => a + w, 0);
  const exact = weights.map((w) => (total * w) / sum);
  const out = exact.map((x) => Math.max(3, Math.floor(x)));
  let left = total - out.reduce((a, h) => a + h, 0);
  const byFraction = exact.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f);
  for (let k = 0; left > 0; k = (k + 1) % byFraction.length, left--) out[byFraction[k]!.i]! += 1;
  return out;
}

function Panel(props: {
  n: number;
  name: string;
  count: string;
  rows: Seg[][];
  selected: number;
  focused: boolean;
  height: number;
  innerWidth: number;
  maxRows: number;
}) {
  const { n, name, count, rows, selected, focused, height, innerWidth, maxRows } = props;
  const overflow = maxRows > 0 && rows.length > maxRows;
  const badge = overflow ? `${selected + 1}/${rows.length}` : count;
  return (
    <Box
      flexDirection="column"
      height={height}
      flexShrink={0}
      borderStyle={BORDER}
      borderColor={focused ? COLORS.borderActive : COLORS.border}
      overflowY="hidden"
    >
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold={focused} color={focused ? COLORS.blue : COLORS.fgDark}>{`[${n}] ${name}`}</Text>
        <Text color={COLORS.dim}>{badge}</Text>
      </Box>
      <Box flexDirection="column">
        <RowList rows={rows} selected={selected} focused={focused} width={innerWidth} maxRows={maxRows} />
      </Box>
    </Box>
  );
}

// ------------------------------------------------------------------ main pane

function MainPane(props: {
  title: string;
  sub: Seg[];
  lines: DisplayLine[];
  scroll: number;
  maxRows: number;
  innerWidth: number;
  cursorLine: number; // absolute line index of the in-pane cursor, or -1
  paneFocused: boolean;
}) {
  const { title, sub, lines, scroll, maxRows, innerWidth, cursorLine, paneFocused } = props;
  const total = lines.length;
  const overflow = total > maxRows;
  const start = overflow ? Math.min(scroll, Math.max(0, total - maxRows)) : 0;
  const shown = lines.slice(start, start + maxRows);
  const end = start + shown.length;
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0} borderStyle={BORDER} borderColor={paneFocused ? COLORS.borderActive : COLORS.border} overflowY="hidden">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color={COLORS.blue}>{trunc(title, Math.max(4, innerWidth - 3 - segLen(sub)))}</Text>
        <Text>{sub.map((s, i) => (<Text key={i} color={s.c} bold={s.b}>{s.t}</Text>))}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {shown.map((line, i) => {
          const abs = start + i;
          const isCursor = abs === cursorLine;
          const bg = isCursor ? COLORS.selection : line.bg;
          const fill = isCursor ? ' '.repeat(Math.max(0, innerWidth - segLen(line.segs) - 1)) : '';
          return (
            <Text key={i} wrap="truncate" backgroundColor={bg} inverse={NO_COLOR && isCursor}>
              {isCursor ? <Text color={COLORS.blue} backgroundColor={bg}>{GLYPHS.accent}</Text> : null}
              {line.segs.map((s, j) => (<Text key={j} color={s.c} bold={s.b} backgroundColor={bg}>{s.t}</Text>))}
              {isCursor ? <Text backgroundColor={bg}>{fill}</Text> : null}
            </Text>
          );
        })}
      </Box>
      {overflow && (
        <Box justifyContent="space-between" paddingX={1}>
          <Text color={COLORS.dim}>{`${start + 1}–${end} / ${total}`}</Text>
          <Text color={COLORS.dim}>{paneFocused ? `${GLYPHS.up}${GLYPHS.down} line · ${GLYPHS.enter} open · ${GLYPHS.arrowL} back` : `PgUp/PgDn · ${GLYPHS.ctrl}u/${GLYPHS.ctrl}d · ${GLYPHS.arrowR} inspect`}</Text>
        </Box>
      )}
    </Box>
  );
}

/** Main pane for a filter that hides every skill: what hides them and how to clear it. */
function emptyFilterView(filter: string, failOnly: boolean): { title: string; sub: Seg[]; lines: DisplayLine[]; anchors: number[] } {
  const line = (t: string, c: string): DisplayLine => ({ segs: [seg(t, c)] });
  const lines: DisplayLine[] = [line('No skill matches the current view.', COLORS.orange), line(' ', COLORS.fg)];
  if (failOnly) {
    lines.push(line('Failures-only is on, and no skill has a failing case.', COLORS.fgDark));
    lines.push(line('Press F to show all skills.', COLORS.comment));
  }
  if (filter) {
    if (failOnly) lines.push(line(' ', COLORS.fg));
    lines.push(line(`No skill or case id contains "${filter}".`, COLORS.fgDark));
    lines.push(line('Press / and then esc to clear the filter.', COLORS.comment));
  }
  return { title: 'No matches', sub: [], lines, anchors: [] };
}

// ------------------------------------------------------------------ status bar

function StatusBar({ focused, caseMode, pane, sk, filter, filtering, failOnly, sortMode, noting, note, flash, flashWarn }: { flashWarn: boolean; focused: Focus; caseMode: CaseMode; pane: boolean; sk: Skill | undefined; filter: string; filtering: boolean; failOnly: boolean; sortMode: SortMode; noting: boolean; note: string; flash: string }) {
  const ud = `${GLYPHS.up}${GLYPHS.down}`;
  const hints: [string, string][] = !sk
    ? [['F', 'failures-only'], ['/', 'filter'], ['?', 'help'], ['q', 'quit']]
    : pane
    ? [[ud, 'line'], [GLYPHS.enter, 'open'], [GLYPHS.arrowL, 'back'], ['?', 'help']]
    : focused === 'skills'
      ? [[ud, 'skill'], [GLYPHS.arrowR, 'inspect'], ['/', 'filter'], ['r', 'run'], ['o', 'opts'], ['C', 'create'], ['?', 'help']]
      : focused === 'cases'
        ? [[ud, 'case'], [GLYPHS.arrowR, 'inspect'], ['[ ]', caseMode], ['f', 'note'], ['/', 'filter'], ['?', 'help']]
        : focused === 'assertions'
          ? [[ud, 'assertion'], [GLYPHS.arrowR, 'sections'], ['tab', 'panel'], ['?', 'help']]
          : [[ud, 'run'], [GLYPHS.arrowR, 'sections'], ['c', 'pin base'], ['tab', 'panel'], ['?', 'help']];
  return (
    <Box height={1} justifyContent="space-between" paddingX={1}>
      <Box>
        {noting ? (
          <Text><Text color={COLORS.yellow} bold>{'note: '}</Text><Text color={COLORS.fg}>{note}</Text><Text color={COLORS.blue}>{GLYPHS.accent}</Text></Text>
        ) : filtering ? (
          <Text><Text color={COLORS.yellow} bold>{'/ '}</Text><Text color={COLORS.fg}>{filter}</Text><Text color={COLORS.blue}>{GLYPHS.accent}</Text></Text>
        ) : flash ? (
          <Text color={flashWarn ? COLORS.orange : COLORS.green} wrap="truncate-middle">{flash}</Text>
        ) : (
          <Box>
            {filter ? <Text color={COLORS.cyan}>{'/' + filter + '  '}</Text> : null}
            {failOnly ? <Text color={COLORS.red}>{'fail-only  '}</Text> : null}
            {sortMode !== 'name' ? <Text color={COLORS.magenta}>{'sort:' + sortMode + '  '}</Text> : null}
            {hints.map(([k, l], i) => (
              <Text key={i}>
                <Text color={COLORS.yellow} bold>{k}</Text>
                <Text color={COLORS.comment}>{` ${l}   `}</Text>
              </Text>
            ))}
          </Box>
        )}
      </Box>
      {sk ? (
        <Box>
          <Text color={COLORS.green}>{GLYPHS.play + ' '}</Text>
          <Text color={COLORS.blue}>{sk.model}</Text>
          <Text color={COLORS.comment}>{'  ' + GLYPHS.sigma + ' '}</Text>
          <Text color={COLORS.green}>{sk.totalCost}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

// Rendered from the canonical KEYMAP (src/tui/keymap.ts), the same source the
// docs page is generated from, so the overlay and the docs cannot drift.
type HelpLine = { kind: 'title' | 'section' | 'blank' } & { text: string } | { kind: 'binding'; keys: string; desc: string; context?: string };

const HELP_LINES: HelpLine[] = [
  { kind: 'title', text: 'Keybindings' },
  ...KEYMAP.flatMap((section): HelpLine[] => [
    { kind: 'blank', text: '' },
    { kind: 'section', text: section.title },
    ...section.bindings.map((b): HelpLine => ({ kind: 'binding', keys: b.keys.join(' '), desc: b.desc, context: b.context })),
  ]),
];

/** Rows of help text that fit: the screen minus border (2), padding (2), and the footer (2). */
const helpWindow = (rows: number): number => Math.max(3, rows - 6);
/** Largest useful scroll offset for the help overlay at this height. */
const helpScrollMax = (rows: number): number => Math.max(0, HELP_LINES.length - helpWindow(rows));

function HelpView({ rows, cols, scroll }: { rows: number; cols: number; scroll: number }) {
  const windowRows = helpWindow(rows);
  const start = Math.min(scroll, helpScrollMax(rows));
  const shown = HELP_LINES.slice(start, start + windowRows);
  const more = HELP_LINES.length > windowRows;
  return (
    <Box flexDirection="column" borderStyle={BORDER} borderColor={COLORS.borderActive} paddingX={2} paddingY={1} width={cols} height={rows}>
      <Box flexDirection="column" flexGrow={1}>
        {shown.map((line, i) => {
          if (line.kind === 'binding') {
            return (
              <Text key={i} wrap="truncate">
                <Text color={COLORS.yellow} bold>{pad(line.keys, 18)}</Text>
                <Text color={COLORS.fgDark}>{line.desc}</Text>
                {line.context ? <Text color={COLORS.comment}>{' (' + line.context + ')'}</Text> : null}
              </Text>
            );
          }
          if (line.kind === 'title') return <Text key={i} bold color={COLORS.blue}>{line.text}</Text>;
          if (line.kind === 'section') return <Text key={i} bold color={COLORS.comment}>{line.text}</Text>;
          return <Text key={i}> </Text>;
        })}
      </Box>
      <Box height={1} />
      <Text color={COLORS.comment} wrap="truncate">
        {more ? `${start + 1}-${start + shown.length} of ${HELP_LINES.length}   ${GLYPHS.up}${GLYPHS.down} PgUp PgDn scroll   any other key closes` : 'press any key to close'}
      </Text>
    </Box>
  );
}

// ------------------------------------------------------------------ app

export function App({ skills, runs, onAction, onReload, initial, showWithout }: { skills: Skill[]; runs: Run[]; onAction: (a: AppAction) => void; onReload?: (skillDir: string) => void | Promise<void>; initial?: AppState; showWithout?: boolean }) {
  const { cols, rows: rowsT } = useTerminalSize();

  const [focused, setFocused] = useState<Focus>(initial?.focused ?? 'cases');
  const [sel, setSel] = useState<Sel>(initial?.sel ?? { skills: 0, cases: 0, assertions: 0, runs: 0 });
  const [caseMode, setCaseMode] = useState<CaseMode>(initial?.caseMode ?? 'overview');
  const [showHelp, setShowHelp] = useState(false);
  const [helpScroll, setHelpScroll] = useState(0);
  const [scroll, setScroll] = useState(0);
  const [pane, setPane] = useState(false);   // in-pane cursor active
  const [cursor, setCursor] = useState(0);   // index into the current view's anchors
  const [filter, setFilter] = useState('');
  const [filtering, setFiltering] = useState(false);
  const [failOnly, setFailOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [noting, setNoting] = useState(false);
  const [note, setNote] = useState('');
  const [flash, setFlashText] = useState('');
  const [flashWarn, setFlashWarn] = useState(false); // warnings and failures render in orange, not green
  const setFlash = (text: string, warn = false) => { setFlashText(text); setFlashWarn(warn); };
  const [compareBase, setCompareBase] = useState<Run | null>(null);
  const [runOptions, setRunOptions] = useState(false);
  const runCtl = useRunController();              // in-process run console (r / R / o)
  const [creating, setCreating] = useState(false); // new-eval-case form (n)
  const [creatingSuite, setCreatingSuite] = useState(false); // guided create form (C)

  const viewSkills = applySkillView(skills, filter, failOnly, sortMode);
  const sk = viewSkills[clampIdx(sel.skills, viewSkills.length)];
  const viewCases = sk ? applyCaseView(sk.cases, filter, failOnly) : [];
  const cs = viewCases[clampIdx(sel.cases, viewCases.length)];
  const asrt = cs?.assertions[clampIdx(sel.assertions, cs.assertions.length)];
  const run = runs[clampIdx(sel.runs, runs.length)];

  // A reload can reorder skills and cases, so selection is restored by id,
  // not by index, once the reloaded workspace has rendered.
  const [restore, setRestore] = useState<{ skill: string; caseId?: string } | null>(null);
  const reload = (skillDir: string) => {
    const want = sk ? { skill: sk.id, caseId: cs?.id } : null;
    void Promise.resolve(onReload?.(skillDir)).then(() => { if (want) setRestore(want); });
  };
  useEffect(() => {
    if (!restore) return;
    setRestore(null);
    const si = viewSkills.findIndex((s) => s.id === restore.skill);
    if (si < 0) return;
    const ci = restore.caseId ? applyCaseView(viewSkills[si]!.cases, filter, failOnly).findIndex((c) => c.id === restore.caseId) : -1;
    setSel((s) => ({ ...s, skills: si, cases: ci >= 0 ? ci : s.cases }));
  }, [restore]);

  // Reset pane/cursor/scroll whenever the projected view changes.
  const viewKey = `${focused}|${sel.skills}|${sel.cases}|${sel.assertions}|${sel.runs}|${caseMode}`;
  useEffect(() => { setScroll(0); setPane(false); setCursor(0); }, [viewKey]);

  const maxRows = Math.max(4, rowsT - 7);
  const railWidth = Math.max(34, Math.min(48, Math.floor(cols * 0.4)));
  const innerRail = railWidth - 2;
  const mainInner = Math.max(10, cols - railWidth - 2);
  const main = sk ? buildMain(focused, sk, cs, asrt!, run, caseMode, showWithout ?? true, compareBase ?? undefined, mainInner) : emptyFilterView(filter, failOnly);
  const anchors = main.anchors;
  const scrollMax = Math.max(0, main.lines.length - maxRows);
  const cursorLine = pane && anchors.length ? (anchors[clampIdx(cursor, anchors.length)] ?? -1) : -1;

  // Keep an anchor line within the visible window.
  const scrollToLine = (cl: number) => setScroll((s) => (cl < s ? cl : cl >= s + maxRows ? cl - maxRows + 1 : s));

  useInput((input, key) => {
    // In-process run console owns the screen while a run is active. Ink never
    // unmounts; on completion, enter/esc reload the affected skill in place.
    if (runCtl.state.active) {
      if (runCtl.state.done && (key.return || key.escape)) { runCtl.close(); if (sk) reload(sk.dir); }
      else if (!runCtl.state.done && key.escape) runCtl.cancel(); // run-abort: stop the run, a second esc closes now
      return;
    }
    if (creating || creatingSuite || runOptions) return; // overlay forms own input via their own useInput
    if (noting) {
      if (key.return) {
        if (sk && cs) {
          const skill = sk; const caseId = cs.id; const text = note;
          void writeFeedback(skill, caseId, text).then((p) => setFlash('feedback saved → ' + p)).catch((e) => setFlash('feedback failed: ' + (e?.message ?? String(e)), true));
        }
        setNoting(false); return;
      }
      if (key.escape) { setNoting(false); return; }
      if (key.backspace || key.delete) { setNote((n) => n.slice(0, -1)); return; }
      const typed = typedText(input, key);
      if (typed) { setNote((n) => n + typed); return; }
      return;
    }
    if (filtering) {
      if (key.return) { setFiltering(false); return; }
      if (key.escape) { setFiltering(false); setFilter(''); return; }
      if (key.backspace || key.delete) { setFilter((f) => f.slice(0, -1)); return; }
      const typed = input.length > 1 ? typedText(input, key).trim() : typedText(input, key);
      if (typed) { setFilter((f) => f + typed); return; }
      return;
    }
    if (flash) setFlash('');
    if (skills.length === 0) { if (input === 'q') onAction({ type: 'quit' }); return; }
    if (showHelp) {
      const page = helpWindow(rowsT);
      const max = helpScrollMax(rowsT);
      const to = (n: number) => setHelpScroll(Math.max(0, Math.min(max, n)));
      if (key.downArrow || input === 'j') { to(helpScroll + 1); return; }
      if (key.upArrow || input === 'k') { to(helpScroll - 1); return; }
      if (key.pageDown || input === ' ') { to(helpScroll + page); return; }
      if (key.pageUp) { to(helpScroll - page); return; }
      setShowHelp(false); return;
    }
    if (input === 'q') { onAction({ type: 'quit', state: { focused, sel, caseMode } }); return; }
    if (input === '?') { setHelpScroll(0); setShowHelp(true); return; }
    if (input === '/') { setFiltering(true); return; }
    if (input === 'F') { setFailOnly((v) => !v); setSel((s) => ({ ...s, skills: 0, cases: 0, assertions: 0 })); return; }
    if (input === 's') { setSortMode((m) => (m === 'name' ? 'pass' : m === 'pass' ? 'delta' : m === 'delta' ? 'cost' : 'name')); setSel((s) => ({ ...s, skills: 0 })); return; }
    if (!sk) {
      // The filter hides every skill: only filter, sort, help, and panel keys apply.
      if (key.tab) { const i = ORDER.indexOf(focused); const d = key.shift ? -1 : 1; setFocused(ORDER[(i + d + ORDER.length) % ORDER.length]!); return; }
      if (input >= '1' && input <= '4') { setFocused(ORDER[Number(input) - 1]!); return; }
      return;
    }
    if (input === 'f' && focused === 'cases') {
      // feedback.json lives in a run directory, and improve rejects a note without one.
      if (!sk.runDir) { setFlash(`${sk.id} has no runs yet. Press r to run it before adding a note.`, true); return; }
      setNote(''); setNoting(true); return;
    }
    if (input === 'c' && focused === 'runs') { setCompareBase((b) => (b && run && b.runId === run.runId ? null : run ?? null)); return; }
    if (input === 'r') { runCtl.start({ skillDir: sk.dir, caseId: focused === 'cases' && cs ? cs.id : null, compare: false }); return; }
    if (input === 'R') { runCtl.start({ skillDir: sk.dir, caseId: focused === 'cases' && cs ? cs.id : null, compare: true }); return; }
    if (input === 'n' && (focused === 'skills' || focused === 'cases')) { setCreating(true); return; }
    if (input === 'C' && focused === 'skills') {
      if (sk.dir) setCreatingSuite(true);
      else setFlash(`skill directory unknown for ${sk.id}, so there is nowhere to write an eval suite`, true);
      return;
    }
    if (input === 'o') { setRunOptions(true); return; }
    if (input === 'v') { if (focused === 'cases') { setCaseMode((m) => (m === 'raw' ? 'overview' : 'raw')); setPane(false); } return; }
    if (focused === 'cases' && cs && (input === ']' || input === '[')) {
      const modes = modesFor(cs);
      const cur = modes.indexOf(caseMode);
      const ni = ((cur < 0 ? 0 : cur) + (input === ']' ? 1 : -1) + modes.length) % modes.length;
      setCaseMode(modes[ni]!);
      return;
    }

    // panel switching always exits the pane
    if (key.tab) { setPane(false); const i = ORDER.indexOf(focused); const d = key.shift ? -1 : 1; setFocused(ORDER[(i + d + ORDER.length) % ORDER.length]!); return; }
    if (input >= '1' && input <= '4') { setPane(false); setFocused(ORDER[Number(input) - 1]!); return; }

    // enter / leave the in-pane cursor
    if ((key.rightArrow || input === 'l') && !pane && anchors.length) { setPane(true); setCursor(0); scrollToLine(anchors[0] ?? 0); return; }
    if ((key.leftArrow || input === 'h' || key.escape) && pane) { setPane(false); return; }

    if (pane) {
      const len = anchors.length;
      if (key.downArrow || input === 'j') { const n = clampIdx(cursor + 1, len); setCursor(n); scrollToLine(anchors[n] ?? 0); return; }
      if (key.upArrow || input === 'k') { const n = clampIdx(cursor - 1, len); setCursor(n); scrollToLine(anchors[n] ?? 0); return; }
      if (input === 'g') { setCursor(0); scrollToLine(anchors[0] ?? 0); return; }
      if (input === 'G') { const n = len - 1; setCursor(n); scrollToLine(anchors[n] ?? 0); return; }
      if (key.pageDown) { setScroll((s) => Math.min(scrollMax, s + maxRows)); return; }
      if (key.pageUp) { setScroll((s) => Math.max(0, s - maxRows)); return; }
      if (key.return) { // drill into the matching side panel
        const idx = cursor;
        if (focused === 'cases') { setSel((s) => ({ ...s, assertions: idx })); setFocused('assertions'); setPane(false); }
        else if (focused === 'skills') { setSel((s) => ({ ...s, cases: idx, assertions: 0 })); setFocused('cases'); setPane(false); }
        else setPane(false);
        return;
      }
      return;
    }

    // free detail-pane scrolling
    if (key.pageDown) { setScroll((s) => Math.min(scrollMax, s + maxRows)); return; }
    if (key.pageUp) { setScroll((s) => Math.max(0, s - maxRows)); return; }
    if (key.ctrl && input === 'd') { setScroll((s) => Math.min(scrollMax, s + Math.floor(maxRows / 2))); return; }
    if (key.ctrl && input === 'u') { setScroll((s) => Math.max(0, s - Math.floor(maxRows / 2))); return; }

    // list navigation
    const lens: Record<Focus, number> = { skills: viewSkills.length, cases: viewCases.length, assertions: cs?.assertions.length ?? 0, runs: runs.length };
    const move = (d: number) => {
      const len = lens[focused];
      setSel((s) => {
        const next: Sel = { ...s, [focused]: clampIdx((s[focused] ?? 0) + d, len) };
        if (focused === 'skills') { next.cases = 0; next.assertions = 0; }
        if (focused === 'cases') { next.assertions = 0; }
        return next;
      });
    };
    if (key.downArrow || input === 'j') { move(1); return; }
    if (key.upArrow || input === 'k') { move(-1); return; }
    if (input === 'g') { setSel((s) => ({ ...s, [focused]: 0 })); return; }
    if (input === 'G') { setSel((s) => ({ ...s, [focused]: Math.max(0, lens[focused] - 1) })); return; }
    if (key.return) { if (anchors.length) { setPane(true); setCursor(0); scrollToLine(anchors[0] ?? 0); } return; }
  });

  // help visibility is declared with the other state above; the input handler
  // re-registers each render, so it always reads the current value.

  if (skills.length === 0) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={COLORS.orange}>No eval runs found.</Text>
        <Text color={COLORS.comment}>Run `arc-skill-eval run &lt;skill-dir&gt;` first, then `arc-skill-eval browse`.</Text>
      </Box>
    );
  }
  if (showHelp) return <HelpView rows={rowsT} cols={cols} scroll={helpScroll} />;
  // Overlays render in place of the layout (mirrors the help overlay) — Ink
  // stays mounted, so no terminal handoff. Run console takes priority.
  if (runCtl.state.active) return <RunConsole state={runCtl.state} elapsed={runCtl.elapsed} frame={runCtl.frame} />;
  if (runOptions && sk) return (
    <Box padding={1}>
      <RunOptionsForm
        skillName={sk.id}
        caseId={focused === 'cases' && cs ? cs.id : null}
        recentJudgeModels={runs.map((r) => r.judge).concat(sk.judge)}
        recentRunnerModels={runs.map((r) => r.model).concat(sk.model)}
        onRun={({ compare, extraArgs }) => { setRunOptions(false); runCtl.start({ skillDir: sk.dir, caseId: focused === 'cases' && cs ? cs.id : null, compare, extraArgs }); }}
        onClose={() => setRunOptions(false)}
      />
    </Box>
  );
  if (creating && sk) return (
    <NewCaseForm
      skillDir={sk.dir}
      skillName={sk.id}
      onClose={(msg) => { setCreating(false); if (msg) setFlash(msg); reload(sk.dir); }}
      onDryRun={(caseId, msg) => {
        // Reload so the fresh case is visible even if the run is aborted;
        // the run-complete path reloads again with the new grading.
        setCreating(false); setFlash(msg); reload(sk.dir);
        runCtl.start({ skillDir: sk.dir, caseId, compare: false });
      }}
    />
  );
  if (creatingSuite && sk) return (
    <CreateForm
      skillDir={sk.dir}
      skillName={sk.id}
      hasSuite={sk.role !== 'distractor'}
      recentModels={runs.map((r) => r.model).concat(sk.model).filter(Boolean)}
      onClose={(msg) => { setCreatingSuite(false); if (msg) setFlash(msg); reload(sk.dir); }}
    />
  );

  if (cols < 72 || rowsT < 18) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={COLORS.orange}>Terminal too small.</Text>
        <Text color={COLORS.comment}>{`Resize to at least 72×18 (currently ${cols}×${rowsT}).`}</Text>
      </Box>
    );
  }

  // Split the rail into whole-row panel heights. With fractional flex heights
  // the layout rounded a panel shorter than its row estimate, and the
  // selected first row could disappear at 80x24.
  const heights = splitRows(rowsT - 1, [1.4, 1.5, 1.6, 1.2]); // rail = screen minus the status bar
  const cap = (i: number) => Math.max(1, heights[i]! - 3); // border 2 + title 1

  return (
    <Box flexDirection="column" width={cols} height={rowsT}>
      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" width={railWidth}>
          <Panel n={1} name="Skills" height={heights[0]!} count={String(viewSkills.length)} rows={skillRows(viewSkills)} selected={clampIdx(sel.skills, viewSkills.length)} focused={!pane && focused === 'skills'} innerWidth={innerRail} maxRows={cap(0)} />
          <Panel n={2} name="Cases" height={heights[1]!} count={String(viewCases.length)} rows={caseRows(viewCases)} selected={clampIdx(sel.cases, viewCases.length)} focused={!pane && focused === 'cases'} innerWidth={innerRail} maxRows={cap(1)} />
          <Panel n={3} name="Assertions" height={heights[2]!} count={String(cs?.assertions.length ?? 0)} rows={cs ? assertionRows(cs) : []} selected={clampIdx(sel.assertions, cs?.assertions.length ?? 0)} focused={!pane && focused === 'assertions'} innerWidth={innerRail} maxRows={cap(2)} />
          <Panel n={4} name="Runs" height={heights[3]!} count={String(runs.length)} rows={runRows(runs, compareBase?.runId)} selected={sel.runs} focused={!pane && focused === 'runs'} innerWidth={innerRail} maxRows={cap(3)} />
        </Box>
        <MainPane title={main.title} sub={main.sub} lines={main.lines} scroll={scroll} maxRows={maxRows} innerWidth={mainInner} cursorLine={cursorLine} paneFocused={pane} />
      </Box>
      <StatusBar focused={focused} caseMode={caseMode} pane={pane} sk={sk} filter={filter} filtering={filtering} failOnly={failOnly} sortMode={sortMode} noting={noting} note={note} flash={flash} flashWarn={flashWarn} />
    </Box>
  );
}
