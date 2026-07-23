import { useEffect, useState } from 'react';

export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const useCreateAnimation = () => {
  const [caTick, setCaTick] = useState(0);
  const [fsTick, setFsTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return undefined;
    }

    const ca = window.setInterval(
      () => setCaTick((tick) => (tick >= 76 ? 0 : tick + 1)),
      120,
    );
    const fs = window.setInterval(
      () => setFsTick((tick) => (tick >= 66 ? 0 : tick + 1)),
      135,
    );

    return () => {
      window.clearInterval(ca);
      window.clearInterval(fs);
    };
  }, [paused]);

  const T = caTick;
  const at = (x: number) => (T >= x ? 1 : 0);
  const F = fsTick;
  const atFs = (x: number) => (F >= x ? 1 : 0);

  return {
    ca: {
      cmd: at(0),
      read: at(5),
      prop: at(9),
      c1: at(13),
      c2: at(16),
      c3: at(19),
      runh: at(23),
      running: T >= 26 && T < 42 ? 1 : 0,
      done: at(42),
      bar1: at(45),
      bar2: at(47),
      delta: at(50),
      wrote: at(54),
    },
    caSpin: spinnerFrames[T % spinnerFrames.length],
    fs: {
      root: atFs(0),
      pkg: atFs(2),
      src: atFs(4),
      readme: atFs(6),
      copy: atFs(10),
      running: F >= 14 && F < 30 ? 1 : 0,
      fnew1: atFs(32),
      fnew2: atFs(35),
      fnew3: atFs(38),
      checking: F >= 40 && F < 44 ? 1 : 0,
      a1: atFs(44),
      a2: atFs(48),
      a3: atFs(52),
      a4: atFs(56),
      pass: atFs(60),
    },
    fsSpin: spinnerFrames[(F + 3) % spinnerFrames.length],
    controlLabel: paused ? '▶ play' : '⏸ pause',
    toggle: () => setPaused((current) => !current),
    replay: () => {
      setCaTick(0);
      setFsTick(0);
      setPaused(false);
    },
  };
};

const piToolLabels = ['read', 'bash', 'edit', 'write'];

export const usePiAnimation = () => {
  const [piTick, setPiTick] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) {
      return undefined;
    }

    const pi = window.setInterval(
      () => setPiTick((tick) => (tick >= 72 ? 0 : tick + 1)),
      130,
    );

    return () => window.clearInterval(pi);
  }, [paused]);

  const P = piTick;
  const at = (x: number) => (P >= x ? 1 : 0);
  const cycling = P >= 4 && P < 40;
  const active = cycling ? Math.floor((P - 4) / 4) % 4 : -1;

  return {
    pi: {
      prompt: at(0),
      loop: at(3),
      arrow1: at(3),
      arrow2: at(40),
      art: at(42),
      running: cycling ? 1 : 0,
      done: at(42),
      l1: at(48),
      l2: at(52),
    },
    piTools: piToolLabels.map((label, index) => ({
      label,
      border: active === index ? 'var(--tt-cyan)' : 'var(--tt-border)',
      color: active === index || P >= 40 ? 'var(--tt-cyan)' : 'var(--tt-comment)',
      bg:
        active === index
          ? 'color-mix(in srgb, var(--tt-cyan) 14%, var(--tt-bg))'
          : 'transparent',
    })),
    piSpin: spinnerFrames[P % spinnerFrames.length],
    piToolName: piToolLabels[active === -1 ? 0 : active],
    controlLabel: paused ? '▶ play' : '⏸ pause',
    toggle: () => setPaused((current) => !current),
    replay: () => {
      setPiTick(0);
      setPaused(false);
    },
  };
};
