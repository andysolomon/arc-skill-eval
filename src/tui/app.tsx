import React, { useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { COLORS, segLen } from './theme.js';
import type { Seg } from './theme.js';
import type { Skill, Run, Focus, Sel } from './types.js';
import { skillRows, caseRows, assertionRows, runRows, buildMain } from './view-model.js';

const ORDER: Focus[] = ['skills', 'cases', 'assertions', 'runs'];
const SHOW_WITHOUT = true; // surface this as a --no-baseline CLI flag if desired

const clampIdx = (i: number, len: number): number => Math.max(0, Math.min(Math.max(0, len - 1), i));

// ------------------------------------------------------------------ rows

function RowList({ rows, selected, focused, width }: { rows: Seg[][]; selected: number; focused: boolean; width: number }) {
  return (
    <>
      {rows.map((segs, i) => {
        const sel = i === selected;
        const bg = sel ? (focused ? COLORS.selection : COLORS.bgHi) : undefined;
        const accent = focused && sel ? '▌' : ' ';
        const fill = ' '.repeat(Math.max(0, width - segLen(segs) - 1));
        return (
          <Text key={i} wrap="truncate" backgroundColor={bg}>
            <Text color={COLORS.blue} backgroundColor={bg}>{accent}</Text>
            {segs.map((s, j) => (
              <Text key={j} color={s.c} bold={s.b} backgroundColor={bg}>{s.t}</Text>
            ))}
            <Text backgroundColor={bg}>{fill}</Text>
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
}) {
  const { n, name, count, rows, selected, focused, grow, innerWidth } = props;
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
        <Text color={COLORS.dim}>{count}</Text>
      </Box>
      <Box flexDirection="column">
        <RowList rows={rows} selected={selected} focused={focused} width={innerWidth} />
      </Box>
    </Box>
  );
}

// ------------------------------------------------------------------ main pane

function MainPane(props: { title: string; sub: Seg[]; lines: { segs: Seg[]; bg?: string }[]; maxRows: number }) {
  const { title, sub, lines, maxRows } = props;
  // TODO(scroll): naive top-slice. A production build should window around a
  // tracked scroll offset and add PageUp/PageDown when the body overflows.
  const shown = lines.slice(0, maxRows);
  return (
    <Box flexDirection="column" flexGrow={1} flexBasis={0} borderStyle="round" borderColor={COLORS.border} overflowY="hidden">
      <Box justifyContent="space-between" paddingX={1}>
        <Text bold color={COLORS.blue}>{title}</Text>
        <Text>{sub.map((s, i) => (<Text key={i} color={s.c} bold={s.b}>{s.t}</Text>))}</Text>
      </Box>
      <Box flexDirection="column" paddingX={1}>
        {shown.map((line, i) => (
          <Text key={i} wrap="truncate" backgroundColor={line.bg}>
            {line.segs.map((s, j) => (<Text key={j} color={s.c} bold={s.b} backgroundColor={line.bg}>{s.t}</Text>))}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

// ------------------------------------------------------------------ status bar

const HINTS: Record<Focus, [string, string][]> = {
  skills: [['↑↓', 'skill'], ['↵', 'cases'], ['tab', 'panel'], ['?', 'help']],
  cases: [['↑↓', 'case'], ['v', 'raw json'], ['tab', 'panel'], ['?', 'help']],
  assertions: [['↑↓', 'assertion'], ['tab', 'panel'], ['?', 'help']],
  runs: [['↑↓', 'run'], ['↵', 'report'], ['tab', 'panel'], ['?', 'help']],
};

function StatusBar({ focused, rawMode, sk }: { focused: Focus; rawMode: boolean; sk: Skill }) {
  const hints = HINTS[focused].map(([k, l]): [string, string] => (focused === 'cases' && k === 'v' ? ['v', rawMode ? 'rendered' : 'raw json'] : [k, l]));
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
        <Text color={COLORS.green}>{'▶ '}</Text>
        <Text color={COLORS.blue}>{sk.model}</Text>
        <Text color={COLORS.comment}>{'  Σ '}</Text>
        <Text color={COLORS.green}>{sk.totalCost}</Text>
      </Box>
    </Box>
  );
}

function HelpView() {
  const items: [string, string][] = [
    ['↑ ↓  /  j k', 'move selection within the focused panel'],
    ['tab  /  ⇧tab', 'focus next / previous panel'],
    ['1 – 4', 'jump to Skills / Cases / Assertions / Runs'],
    ['v  /  ↵', 'toggle rendered ⇄ raw grading.json (Cases)'],
    ['g  /  G', 'jump to top / bottom of list'],
    ['q  /  ctrl-c', 'quit'],
    ['?', 'toggle this help'],
  ];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={COLORS.borderActive} paddingX={2} paddingY={1}>
      <Text bold color={COLORS.blue}>Keybindings — arc-skill-eval</Text>
      <Box height={1} />
      {items.map(([k, d], i) => (
        <Box key={i}>
          <Box width={16}><Text color={COLORS.yellow} bold>{k}</Text></Box>
          <Text color={COLORS.fgDark}>{d}</Text>
        </Box>
      ))}
      <Box height={1} />
      <Text color={COLORS.comment}>press any key to close</Text>
    </Box>
  );
}

// ------------------------------------------------------------------ app

export function App({ skills, runs }: { skills: Skill[]; runs: Run[] }) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const cols = stdout?.columns ?? 120;
  const rowsT = stdout?.rows ?? 40;

  const [focused, setFocused] = useState<Focus>('cases');
  const [sel, setSel] = useState<Sel>({ skills: 0, cases: 0, assertions: 0, runs: 0 });
  const [showHelp, setShowHelp] = useState(false);
  const [rawMode, setRawMode] = useState(false);

  if (skills.length === 0) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color={COLORS.orange}>No eval runs found.</Text>
        <Text color={COLORS.comment}>Run `arc-skill-eval run &lt;skill-dir&gt;` first, then `arc-skill-eval browse`.</Text>
      </Box>
    );
  }

  const sk = skills[clampIdx(sel.skills, skills.length)]!;
  const cs = sk.cases[clampIdx(sel.cases, sk.cases.length)]!;
  const asrt = cs.assertions[clampIdx(sel.assertions, cs.assertions.length)]!;
  const run = runs[clampIdx(sel.runs, runs.length)];

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
  const jump = (end: boolean) => {
    const len = lens[focused];
    setSel((s) => ({ ...s, [focused]: end ? Math.max(0, len - 1) : 0 }));
  };

  useInput((input, key) => {
    if (showHelp) { setShowHelp(false); return; }
    if (input === 'q') { exit(); return; }
    if (input === '?') { setShowHelp(true); return; }
    if (key.tab) {
      const i = ORDER.indexOf(focused);
      const d = key.shift ? -1 : 1;
      setFocused(ORDER[(i + d + ORDER.length) % ORDER.length]!);
      return;
    }
    if (input >= '1' && input <= '4') { setFocused(ORDER[Number(input) - 1]!); return; }
    if (key.downArrow || input === 'j') { move(1); return; }
    if (key.upArrow || input === 'k') { move(-1); return; }
    if (input === 'g') { jump(false); return; }
    if (input === 'G') { jump(true); return; }
    if (input === 'v' || key.return) { if (focused === 'cases') setRawMode((v) => !v); return; }
  });

  if (showHelp) return <HelpView />;

  const railWidth = Math.max(34, Math.min(48, Math.floor(cols * 0.4)));
  const innerRail = railWidth - 2;
  const maxRows = Math.max(6, rowsT - 6);
  const main = buildMain(focused, sk, cs, asrt, run, rawMode, SHOW_WITHOUT);

  return (
    <Box flexDirection="column" width={cols} height={rowsT}>
      <Box flexGrow={1} flexDirection="row">
        <Box flexDirection="column" width={railWidth}>
          <Panel n={1} name="Skills" grow={1.4} count={String(skills.length)} rows={skillRows(skills)} selected={sel.skills} focused={focused === 'skills'} innerWidth={innerRail} />
          <Panel n={2} name="Cases" grow={1.5} count={String(sk.cases.length)} rows={caseRows(sk)} selected={clampIdx(sel.cases, sk.cases.length)} focused={focused === 'cases'} innerWidth={innerRail} />
          <Panel n={3} name="Assertions" grow={1.6} count={String(cs.assertions.length)} rows={assertionRows(cs)} selected={clampIdx(sel.assertions, cs.assertions.length)} focused={focused === 'assertions'} innerWidth={innerRail} />
          <Panel n={4} name="Runs" grow={1.2} count={String(runs.length)} rows={runRows(runs)} selected={sel.runs} focused={focused === 'runs'} innerWidth={innerRail} />
        </Box>
        <MainPane title={main.title} sub={main.sub} lines={main.lines} maxRows={maxRows} />
      </Box>
      <StatusBar focused={focused} rawMode={rawMode} sk={sk} />
    </Box>
  );
}
