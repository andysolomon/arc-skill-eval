import { useEffect, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { COLORS, segLen } from './theme.js';
import { GLYPHS } from './caps.js';
import type { Seg } from './theme.js';
import type { Skill, Run, Focus, Sel } from './types.js';
import { skillRows, caseRows, assertionRows, runRows, buildMain } from './view-model.js';

const ORDER: Focus[] = ['skills', 'cases', 'assertions', 'runs'];

/** UI state the controller can restore after a re-run remounts the App. */
export interface AppState {
  focused: Focus;
  sel: Sel;
  rawMode: boolean;
}

/** Actions the App hands back to the controller loop (browse-command.ts). */
export type AppAction =
  | { type: 'quit' }
  | { type: 'rerun'; skillDir: string; caseId: string | null; state: AppState };

const clampIdx = (i: number, len: number): number => Math.max(0, Math.min(Math.max(0, len - 1), i));

interface DisplayLine { segs: Seg[]; bg?: string }

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
          <Text key={i} wrap="truncate" backgroundColor={bg}>
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

function Panel(props: {
  n: number;
  name: string;
  count: string;
  rows: Seg[][];
  selected: number;
  focused: boolean;
  grow: number;
  innerWidth: number;
  maxRows: number;
}) {
  const { n, name, count, rows, selected, focused, grow, innerWidth, maxRows } = props;
  const overflow = maxRows > 0 && rows.length > maxRows;
  const badge = overflow ? `${selected + 1}/${rows.length}` : count;
  return (
    <Box
      flexDirection="column"
      flexGrow={grow}
      flexBasis={0}
      minHeight={3}
      borderStyle="round"
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
    <Box flexDirection="column" flexGrow={1} flexBasis={0} borderStyle="round" borderColor={paneFocused ? COLORS.borderActive : COLORS.border} overflowY="hidden">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color={COLORS.blue}>{title}</Text>
        <Text>{sub.map((s, i) => (<Text key={i} color={s.c} bold={s.b}>{s.t}</Text>))}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} paddingX={1}>
        {shown.map((line, i) => {
          const abs = start + i;
          const isCursor = abs === cursorLine;
          const bg = isCursor ? COLORS.selection : line.bg;
          const fill = isCursor ? ' '.repeat(Math.max(0, innerWidth - segLen(line.segs) - 1)) : '';
          return (
            <Text key={i} wrap="truncate" backgroundColor={bg}>
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

// ------------------------------------------------------------------ status bar

function StatusBar({ focused, rawMode, pane, sk }: { focused: Focus; rawMode: boolean; pane: boolean; sk: Skill }) {
  const ud = `${GLYPHS.up}${GLYPHS.down}`;
  const hints: [string, string][] = pane
    ? [[ud, 'line'], [GLYPHS.enter, 'open'], [GLYPHS.arrowL, 'back'], ['?', 'help']]
    : focused === 'skills'
      ? [[ud, 'skill'], [GLYPHS.arrowR, 'inspect'], ['r', 'run'], ['tab', 'panel'], ['?', 'help']]
      : focused === 'cases'
        ? [[ud, 'case'], [GLYPHS.arrowR, 'inspect'], ['v', rawMode ? 'rendered' : 'raw'], ['r', 'run'], ['tab', 'panel'], ['?', 'help']]
        : focused === 'assertions'
          ? [[ud, 'assertion'], [GLYPHS.arrowR, 'sections'], ['tab', 'panel'], ['?', 'help']]
          : [[ud, 'run'], [GLYPHS.arrowR, 'sections'], ['tab', 'panel'], ['?', 'help']];
  return (
    <Box height={1} justifyContent="space-between" paddingX={1}>
      <Box>
        {hints.map(([k, l], i) => (
          <Text key={i}>
            <Text color={COLORS.yellow} bold>{k}</Text>
            <Text color={COLORS.comment}>{` ${l}   `}</Text>
          </Text>
        ))}
      </Box>
      <Box>
        <Text color={COLORS.green}>{GLYPHS.play + ' '}</Text>
        <Text color={COLORS.blue}>{sk.model}</Text>
        <Text color={COLORS.comment}>{'  ' + GLYPHS.sigma + ' '}</Text>
        <Text color={COLORS.green}>{sk.totalCost}</Text>
      </Box>
    </Box>
  );
}

function HelpView() {
  const items: [string, string][] = [
    [`${GLYPHS.up} ${GLYPHS.down}  /  j k`, 'move selection in the focused panel (or cursor in the pane)'],
    [`tab  /  ${GLYPHS.shift}tab`, 'focus next / previous panel'],
    ['1 – 4', 'jump to Skills / Cases / Assertions / Runs'],
    [`${GLYPHS.arrowR} / l / ${GLYPHS.enter}`, 'enter the detail pane cursor (Skills, Cases)'],
    [`${GLYPHS.enter}  (in pane)`, 'drill into the highlighted item'],
    [`${GLYPHS.arrowL} / h / esc`, 'leave the detail pane cursor'],
    ['v', `toggle rendered ${GLYPHS.compare} raw grading.json (Cases)`],
    [`PgUp/PgDn · ${GLYPHS.ctrl}u/${GLYPHS.ctrl}d`, 'scroll the detail pane'],
    ['r', 'run evals for the selected skill/case, then reload'],
    ['g  /  G', 'jump to top / bottom'],
    ['q  /  ctrl-c', 'quit'],
  ];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1}>
      <Text bold color={COLORS.blue}>Keybindings — arc-skill-eval</Text>
      <Box height={1} />
      {items.map(([k, d], i) => (
        <Box key={i}>
          <Box width={22}><Text color={COLORS.yellow} bold>{k}</Text></Box>
          <Text color={COLORS.fgDark}>{d}</Text>
        </Box>
      ))}
      <Box height={1} />
      <Text color={COLORS.comment}>press any key to close</Text>
    </Box>
  );
}

// ------------------------------------------------------------------ app

export function App({ skills, runs, onAction, initial, showWithout }: { skills: Skill[]; runs: Run[]; onAction: (a: AppAction) => void; initial?: AppState; showWithout?: boolean }) {
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;
  const rowsT = stdout?.rows ?? 40;

  const [focused, setFocused] = useState<Focus>(initial?.focused ?? 'cases');
  const [sel, setSel] = useState<Sel>(initial?.sel ?? { skills: 0, cases: 0, assertions: 0, runs: 0 });
  const [rawMode, setRawMode] = useState(initial?.rawMode ?? false);
  const [showHelp, setShowHelp] = useState(false);
  const [scroll, setScroll] = useState(0);
  const [pane, setPane] = useState(false);   // in-pane cursor active
  const [cursor, setCursor] = useState(0);   // index into the current view's anchors

  const sk = skills[clampIdx(sel.skills, skills.length)];
  const cs = sk?.cases[clampIdx(sel.cases, sk.cases.length)];
  const asrt = cs?.assertions[clampIdx(sel.assertions, cs.assertions.length)];
  const run = runs[clampIdx(sel.runs, runs.length)];

  // Reset pane/cursor/scroll whenever the projected view changes.
  const viewKey = `${focused}|${sel.skills}|${sel.cases}|${sel.assertions}|${sel.runs}|${rawMode}`;
  useEffect(() => { setScroll(0); setPane(false); setCursor(0); }, [viewKey]);

  const maxRows = Math.max(4, rowsT - 7);
  const main = sk && cs ? buildMain(focused, sk, cs, asrt!, run, rawMode, showWithout ?? true) : { title: '', sub: [] as Seg[], lines: [] as DisplayLine[], anchors: [] as number[] };
  const anchors = main.anchors;
  const scrollMax = Math.max(0, main.lines.length - maxRows);
  const cursorLine = pane && anchors.length ? (anchors[clampIdx(cursor, anchors.length)] ?? -1) : -1;

  // Keep an anchor line within the visible window.
  const scrollToLine = (cl: number) => setScroll((s) => (cl < s ? cl : cl >= s + maxRows ? cl - maxRows + 1 : s));

  useInput((input, key) => {
    if (!sk || !cs) { if (input === 'q') onAction({ type: 'quit' }); return; }
    if (showHelp) { setShowHelp(false); return; }
    if (input === 'q') { onAction({ type: 'quit' }); return; }
    if (input === '?') { setShowHelp(true); return; }
    if (input === 'r') { onAction({ type: 'rerun', skillDir: sk.dir, caseId: focused === 'cases' ? cs.id : null, state: { focused, sel, rawMode } }); return; }
    if (input === 'v') { if (focused === 'cases') { setRawMode((vv) => !vv); setPane(false); } return; }

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
    const lens: Record<Focus, number> = { skills: skills.length, cases: sk.cases.length, assertions: cs.assertions.length, runs: runs.length };
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

  if (!sk || !cs) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={COLORS.orange}>No eval runs found.</Text>
        <Text color={COLORS.comment}>Run `arc-skill-eval run &lt;skill-dir&gt;` first, then `arc-skill-eval browse`.</Text>
      </Box>
    );
  }
  if (showHelp) return <HelpView />;

  const railWidth = Math.max(34, Math.min(48, Math.floor(cols * 0.4)));
  const innerRail = railWidth - 2;
  const mainInner = Math.max(10, cols - railWidth - 2);

  // Approximate each panel's visible row capacity from the rail height and the
  // flexGrow ratios (border 2 + title 1 = 3 chrome rows per panel).
  const grows = { skills: 1.4, cases: 1.5, assertions: 1.6, runs: 1.2 };
  const sumG = grows.skills + grows.cases + grows.assertions + grows.runs;
  const railH = rowsT - 1; // minus the status bar
  const cap = (g: number) => Math.max(1, Math.floor((railH * g) / sumG) - 3);

  return (
    <Box flexDirection="column" width={cols} height={rowsT}>
      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" width={railWidth}>
          <Panel n={1} name="Skills" grow={grows.skills} count={String(skills.length)} rows={skillRows(skills)} selected={sel.skills} focused={!pane && focused === 'skills'} innerWidth={innerRail} maxRows={cap(grows.skills)} />
          <Panel n={2} name="Cases" grow={grows.cases} count={String(sk.cases.length)} rows={caseRows(sk)} selected={clampIdx(sel.cases, sk.cases.length)} focused={!pane && focused === 'cases'} innerWidth={innerRail} maxRows={cap(grows.cases)} />
          <Panel n={3} name="Assertions" grow={grows.assertions} count={String(cs.assertions.length)} rows={assertionRows(cs)} selected={clampIdx(sel.assertions, cs.assertions.length)} focused={!pane && focused === 'assertions'} innerWidth={innerRail} maxRows={cap(grows.assertions)} />
          <Panel n={4} name="Runs" grow={grows.runs} count={String(runs.length)} rows={runRows(runs)} selected={sel.runs} focused={!pane && focused === 'runs'} innerWidth={innerRail} maxRows={cap(grows.runs)} />
        </Box>
        <MainPane title={main.title} sub={main.sub} lines={main.lines} scroll={scroll} maxRows={maxRows} innerWidth={mainInner} cursorLine={cursorLine} paneFocused={pane} />
      </Box>
      <StatusBar focused={focused} rawMode={rawMode} pane={pane} sk={sk} />
    </Box>
  );
}
