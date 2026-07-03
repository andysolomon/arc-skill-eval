// Run console overlay + the hook that owns run state. Rendered on top of the
// browser when a run is in flight. Ink stays mounted the whole time.

import { useEffect, useReducer, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { COLORS } from './theme.js';
import { GLYPHS } from './caps.js';
import { runInProcess } from './run-driver.js';
import type { RunCaseState, RunEvent, RunRequest } from './run-driver.js';

const SPINNER_UNI = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_ASCII = ['|', '/', '-', '\\'];
void SPINNER_UNI; void SPINNER_ASCII; // retained for reference; GLYPHS.spinner is canonical

interface RunState {
  active: boolean;
  done: boolean;
  skill: string;
  compare: boolean;
  extraArgs?: string;
  cases: RunCaseState[];
  passed: number;
  failed: number;
  error: string | null;
}

const initialRun: RunState = { active: false, done: false, skill: '', compare: false, cases: [], passed: 0, failed: 0, error: null };

function reducer(state: RunState, ev: RunEvent | { type: 'reset' }): RunState {
  switch (ev.type) {
    case 'reset': return initialRun;
    case 'init': return { ...initialRun, active: true, skill: ev.skill, compare: ev.compare, extraArgs: ev.extraArgs, cases: ev.cases };
    case 'case-start': return { ...state, cases: state.cases.map((c) => (c.id === ev.id ? { ...c, phase: 'running' } : c)) };
    case 'case-progress': return { ...state, cases: state.cases.map((c) => (c.id === ev.id ? { ...c, assertPass: ev.assertPass } : c)) };
    case 'case-done': return { ...state, cases: state.cases.map((c) => (c.id === ev.id ? { ...c, phase: ev.phase, assertPass: ev.assertPass, assertTotal: ev.assertTotal || c.assertTotal, message: ev.message, errored: ev.errored } : c)) };
    case 'done': return { ...state, done: true, passed: ev.passed, failed: ev.failed };
    case 'error': return { ...state, done: true, error: ev.message };
    default: return state;
  }
}

/** Owns run state + the elapsed clock + the spinner frame. */
export function useRunController() {
  const [state, dispatch] = useReducer(reducer, initialRun);
  const [elapsed, setElapsed] = useState(0);
  const [frame, setFrame] = useState(0);
  const t0 = useRef(0);

  useEffect(() => {
    if (!state.active || state.done) return;
    t0.current = Date.now();
    const clock = setInterval(() => setElapsed((Date.now() - t0.current) / 1000), 100);
    const spin = setInterval(() => setFrame((f) => f + 1), 80);
    return () => { clearInterval(clock); clearInterval(spin); };
  }, [state.active, state.done]);

  const start = (req: RunRequest) => { dispatch({ type: 'reset' }); void runInProcess(req, dispatch); };
  const close = () => dispatch({ type: 'reset' });
  return { state, elapsed, frame, start, close };
}

function bar(passed: number, total: number, w = 14): string {
  if (total <= 0) return '';
  const filled = Math.round((passed / total) * w);
  return GLYPHS.barFull.repeat(filled) + GLYPHS.barEmpty.repeat(Math.max(0, w - filled));
}

export function RunConsole({ state, elapsed, frame }: { state: RunState; elapsed: number; frame: number }) {
  const spinner = GLYPHS.spinner[frame % GLYPHS.spinner.length] ?? '.';
  const t = elapsed.toFixed(1) + 's';
  const doneN = state.cases.filter((c) => c.phase === 'pass' || c.phase === 'fail').length;
  // Display-only: the run summary's pass/fail math is untouched; errored cases
  // are counted from the rows so the header can call them out separately.
  const erroredN = state.cases.filter((c) => c.errored).length;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={state.done ? (state.failed ? COLORS.red : COLORS.green) : COLORS.border} paddingX={2} paddingY={1} width={64}>
      {/* header */}
      {state.done ? (
        <Text>
          <Text color={state.failed ? COLORS.red : COLORS.green} bold>{state.failed ? GLYPHS.fail : GLYPHS.pass}</Text>
          <Text bold>{'  run complete   '}</Text>
          <Text color={COLORS.green}>{state.passed + ' passed'}</Text>
          {state.failed ? <Text color={COLORS.red}>{'  ' + state.failed + ' failed'}</Text> : null}
          {erroredN ? <Text color={COLORS.orange}>{'  ' + erroredN + ' errored'}</Text> : null}
          <Text color={COLORS.comment}>{'   ' + t}</Text>
        </Text>
      ) : (
        <Text>
          <Text color={COLORS.cyan} bold>{spinner + ' '}</Text>
          <Text bold>{'running evals   '}</Text>
          <Text color={COLORS.fgDark}>{doneN + '/' + state.cases.length + ' cases'}</Text>
          <Text color={COLORS.comment}>{'   ' + t}</Text>
        </Text>
      )}
      <Text color={COLORS.comment}>{'$ arc-skill-eval run ./skills/' + state.skill + (state.compare ? ' --compare' : '') + (state.extraArgs ? ' ' + state.extraArgs : '')}</Text>
      <Box height={1} />

      {/* per-case rows */}
      {state.cases.map((c) => {
        if (c.errored) {
          // Errored cases never ran their assertions — a red 0/0 fail bar would
          // read as "all assertions failed", so render a distinct error row.
          return (
            <Box key={c.id} flexDirection="column">
              <Text>
                <Text color={COLORS.orange} bold>{' !  '}</Text>
                <Text color={COLORS.fg}>{c.id.padEnd(28)}</Text>
                <Text color={COLORS.orange}>{'error'}</Text>
              </Text>
              {c.message ? <Text color={COLORS.dim} wrap="truncate">{'    ' + c.message}</Text> : null}
            </Box>
          );
        }
        const g = c.phase === 'pass' ? GLYPHS.pass : c.phase === 'fail' ? GLYPHS.fail : c.phase === 'running' ? spinner : GLYPHS.bullet;
        const gc = c.phase === 'pass' ? COLORS.green : c.phase === 'fail' ? COLORS.red : c.phase === 'running' ? COLORS.cyan : COLORS.dim;
        return (
          <Text key={c.id}>
            <Text color={gc} bold={c.phase !== 'queued'}>{' ' + g + '  '}</Text>
            <Text color={c.phase === 'queued' ? COLORS.comment : COLORS.fg}>{c.id.padEnd(28)}</Text>
            <Text color={c.phase === 'fail' ? COLORS.red : COLORS.green}>{bar(c.assertPass, c.assertTotal)}</Text>
            <Text color={COLORS.comment}>{c.phase === 'queued' ? '  queued' : '  ' + c.assertPass + '/' + c.assertTotal}</Text>
          </Text>
        );
      })}
      {state.error ? <Text color={COLORS.red}>{'\n' + state.error}</Text> : null}

      <Box height={1} />
      {state.done
        ? <Text><Text color={COLORS.yellow} bold>{'enter'}</Text><Text color={COLORS.comment}>{' reload & close'}</Text></Text>
        : <Text><Text color={COLORS.yellow} bold>{'esc'}</Text><Text color={COLORS.comment}>{' abort   '}</Text><Text color={COLORS.dim}>{'Ink stays mounted — no terminal handoff'}</Text></Text>}
    </Box>
  );
}
