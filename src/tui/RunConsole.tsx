// Run console overlay + the hook that owns run state. Rendered on top of the
// browser when a run is in flight. Ink stays mounted the whole time.

import { useEffect, useReducer, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import { COLORS } from './theme.js';
import { GLYPHS, BORDER } from './caps.js';
import { runInProcess } from './run-driver.js';
import type { RunCaseState, RunEvent, RunRequest } from './run-driver.js';

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
  cancelling: boolean; // esc pressed, waiting for the in-flight case to stop
  cancelled: boolean;  // the run stopped because of esc
}

const initialRun: RunState = { active: false, done: false, skill: '', compare: false, cases: [], passed: 0, failed: 0, error: null, cancelling: false, cancelled: false };

function reducer(state: RunState, ev: RunEvent | { type: 'reset' } | { type: 'cancelling' }): RunState {
  switch (ev.type) {
    case 'reset': return initialRun;
    case 'cancelling': return { ...state, cancelling: true };
    case 'cancelled': return { ...state, done: true, cancelling: false, cancelled: true, cases: state.cases.map((c) => (c.phase === 'running' ? { ...c, phase: 'queued' } : c)) };
    case 'init': return { ...initialRun, active: true, skill: ev.skill, compare: ev.compare, extraArgs: ev.extraArgs, cases: ev.cases };
    case 'case-start': return { ...state, cases: state.cases.map((c) => (c.id === ev.id ? { ...c, phase: 'running' } : c)) };
    case 'case-progress': return { ...state, cases: state.cases.map((c) => (c.id === ev.id ? { ...c, assertPass: ev.assertPass } : c)) };
    case 'case-done': return { ...state, cases: state.cases.map((c) => (c.id === ev.id ? { ...c, phase: ev.phase, assertPass: ev.assertPass, assertTotal: ev.assertTotal || c.assertTotal, message: ev.message, errored: ev.errored } : c)) };
    case 'done': return { ...state, done: true, passed: ev.passed, failed: ev.failed };
    case 'error': return { ...state, done: true, error: ev.message };
    default: return state;
  }
}

/**
 * Owns run state, the elapsed clock, and the spinner frame. Each run gets its
 * own AbortController and a generation number. Events from an older
 * generation are dropped, so a run that winds down after its console closed
 * cannot write into the next run's console.
 */
export function useRunController() {
  const [state, dispatch] = useReducer(reducer, initialRun);
  const [elapsed, setElapsed] = useState(0);
  const [frame, setFrame] = useState(0);
  const t0 = useRef(0);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!state.active || state.done) return;
    t0.current = Date.now();
    const clock = setInterval(() => setElapsed((Date.now() - t0.current) / 1000), 100);
    const spin = setInterval(() => setFrame((f) => f + 1), 80);
    return () => { clearInterval(clock); clearInterval(spin); };
  }, [state.active, state.done]);

  // Quitting the browser mid-run stops the run too.
  useEffect(() => () => { controller.current?.abort(); }, []);

  const start = (req: RunRequest) => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    const gen = ++generation.current;
    setElapsed(0);
    dispatch({ type: 'reset' });
    void runInProcess(req, (ev) => { if (generation.current === gen) dispatch(ev); }, ac.signal);
  };
  /** Close the console now. Any run still going is aborted and its later events are dropped. */
  const close = () => {
    controller.current?.abort();
    controller.current = null;
    generation.current++;
    dispatch({ type: 'reset' });
  };
  /** First esc: abort the run and wait for it to stop. A second esc closes without waiting. */
  const cancel = () => {
    const ac = controller.current;
    if (!ac || ac.signal.aborted) { close(); return; }
    ac.abort();
    dispatch({ type: 'cancelling' });
  };
  return { state, elapsed, frame, start, close, cancel };
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

  const failed = state.error != null;
  const headColor = failed ? COLORS.red : state.cancelled ? COLORS.orange : state.failed ? COLORS.red : COLORS.green;
  const passedRows = state.cases.filter((c) => c.phase === 'pass').length;
  const failedRows = state.cases.filter((c) => c.phase === 'fail' && !c.errored).length;

  return (
    <Box flexDirection="column" borderStyle={BORDER} borderColor={state.done ? headColor : COLORS.border} paddingX={2} paddingY={1} width={64}>
      {/* header */}
      {state.done && failed ? (
        <Text>
          <Text color={COLORS.red} bold>{GLYPHS.fail}</Text>
          <Text bold>{'  run failed'}</Text>
          <Text color={COLORS.comment}>{'   ' + t}</Text>
        </Text>
      ) : state.done && state.cancelled ? (
        <Text>
          <Text color={COLORS.orange} bold>{GLYPHS.fail}</Text>
          <Text bold>{'  run cancelled   '}</Text>
          <Text color={COLORS.fgDark}>{`${passedRows} passed  ${failedRows} failed`}</Text>
          <Text color={COLORS.comment}>{'   ' + t}</Text>
        </Text>
      ) : state.done ? (
        <Text>
          <Text color={headColor} bold>{state.failed ? GLYPHS.fail : GLYPHS.pass}</Text>
          <Text bold>{'  run complete   '}</Text>
          <Text color={COLORS.green}>{state.passed + ' passed'}</Text>
          {state.failed ? <Text color={COLORS.red}>{'  ' + state.failed + ' failed'}</Text> : null}
          {erroredN ? <Text color={COLORS.orange}>{'  ' + erroredN + ' errored'}</Text> : null}
          <Text color={COLORS.comment}>{'   ' + t}</Text>
        </Text>
      ) : state.cancelling ? (
        <Text>
          <Text color={COLORS.orange} bold>{spinner + ' '}</Text>
          <Text bold>{'stopping run   '}</Text>
          <Text color={COLORS.fgDark}>{'waiting for the current case to stop'}</Text>
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
            <Text color={COLORS.comment}>{c.phase === 'queued' ? (state.done ? '  not run' : '  queued') : '  ' + c.assertPass + '/' + c.assertTotal}</Text>
          </Text>
        );
      })}
      {state.error ? <Text color={COLORS.red}>{'\n' + state.error}</Text> : null}

      <Box height={1} />
      {state.done
        ? <Text><Text color={COLORS.yellow} bold>{'enter'}</Text><Text color={COLORS.comment}>{' reload & close'}</Text></Text>
        : state.cancelling
          ? <Text><Text color={COLORS.yellow} bold>{'esc'}</Text><Text color={COLORS.comment}>{' close without waiting'}</Text></Text>
          : <Text><Text color={COLORS.yellow} bold>{'esc'}</Text><Text color={COLORS.comment}>{' stop the run'}</Text></Text>}
    </Box>
  );
}
