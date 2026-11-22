/**
 * Timelines of the animated demos: how a tick advances and which lines are
 * visible at a given tick. Ported from the React `useLearnAnimations` hooks;
 * the ticking itself is a Subscription (see subscription.ts).
 */

import { Array, Option } from 'effect';

import type { CreateDemo, PiDemo, Playback } from './model';

export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const;

const spinnerAt = (index: number): string => spinnerFrames[index % spinnerFrames.length] ?? '';

export const CREATE_COMMAND_TICK_MS = 120;
export const CREATE_SCAFFOLD_TICK_MS = 135;
export const PI_TICK_MS = 130;

const CREATE_COMMAND_LAST_TICK = 76;
const CREATE_SCAFFOLD_LAST_TICK = 66;
const PI_LAST_TICK = 72;

const advance = (tick: number, lastTick: number): number => (tick >= lastTick ? 0 : tick + 1);

export const advanceCreateCommand = (tick: number): number => advance(tick, CREATE_COMMAND_LAST_TICK);
export const advanceCreateScaffold = (tick: number): number => advance(tick, CREATE_SCAFFOLD_LAST_TICK);
export const advancePi = (tick: number): number => advance(tick, PI_LAST_TICK);

/** 1 once the timeline reaches `at`, else 0 (used as an opacity). */
const reached = (tick: number, at: number): number => (tick >= at ? 1 : 0);
const within = (tick: number, from: number, until: number): number => (tick >= from && tick < until ? 1 : 0);

export const playbackLabel = (playback: Playback): string => (playback._tag === 'Paused' ? '▶ play' : '⏸ pause');

// CREATE

export const createCommandFrame = (demo: CreateDemo) => {
  const tick = demo.commandTick;
  return {
    cmd: reached(tick, 0),
    read: reached(tick, 5),
    prop: reached(tick, 9),
    c1: reached(tick, 13),
    c2: reached(tick, 16),
    c3: reached(tick, 19),
    runh: reached(tick, 23),
    running: within(tick, 26, 42),
    done: reached(tick, 42),
    bar1: reached(tick, 45),
    bar2: reached(tick, 47),
    delta: reached(tick, 50),
    wrote: reached(tick, 54),
  };
};

export const createCommandSpinner = (demo: CreateDemo): string => spinnerAt(demo.commandTick);

export const createScaffoldFrame = (demo: CreateDemo) => {
  const tick = demo.scaffoldTick;
  return {
    root: reached(tick, 0),
    pkg: reached(tick, 2),
    src: reached(tick, 4),
    readme: reached(tick, 6),
    copy: reached(tick, 10),
    running: within(tick, 14, 30),
    fnew1: reached(tick, 32),
    fnew2: reached(tick, 35),
    fnew3: reached(tick, 38),
    checking: within(tick, 40, 44),
    a1: reached(tick, 44),
    a2: reached(tick, 48),
    a3: reached(tick, 52),
    a4: reached(tick, 56),
    pass: reached(tick, 60),
  };
};

export const createScaffoldSpinner = (demo: CreateDemo): string => spinnerAt(demo.scaffoldTick + 3);

// PI

const piToolLabels = ['read', 'bash', 'edit', 'write'] as const;

const piCycling = (tick: number): boolean => tick >= 4 && tick < 40;

/** Index of the tool highlighted while the loop cycles. */
const piActiveTool = (tick: number): Option.Option<number> =>
  piCycling(tick) ? Option.some(Math.floor((tick - 4) / 4) % 4) : Option.none();

export const piFrame = (demo: PiDemo) => {
  const tick = demo.tick;
  return {
    prompt: reached(tick, 0),
    loop: reached(tick, 3),
    arrow1: reached(tick, 3),
    arrow2: reached(tick, 40),
    art: reached(tick, 42),
    running: piCycling(tick) ? 1 : 0,
    done: reached(tick, 42),
    l1: reached(tick, 48),
    l2: reached(tick, 52),
  };
};

export type PiTool = Readonly<{ label: string; border: string; color: string; bg: string }>;

export const piTools = (demo: PiDemo): ReadonlyArray<PiTool> => {
  const maybeActive = piActiveTool(demo.tick);
  return Array.map(piToolLabels, (label, index) => {
    const isActive = Option.contains(maybeActive, index);
    return {
      label,
      border: isActive ? 'var(--tt-cyan)' : 'var(--tt-border)',
      color: isActive || demo.tick >= 40 ? 'var(--tt-cyan)' : 'var(--tt-comment)',
      bg: isActive ? 'color-mix(in srgb, var(--tt-cyan) 14%, var(--tt-bg))' : 'transparent',
    };
  });
};

export const piSpinner = (demo: PiDemo): string => spinnerAt(demo.tick);

export const piToolName = (demo: PiDemo): string =>
  piToolLabels[Option.getOrElse(piActiveTool(demo.tick), () => 0)] ?? 'read';
