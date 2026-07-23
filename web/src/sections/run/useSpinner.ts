import { useEffect, useState } from 'react';

export const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const useSpinner = (active: boolean) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      setFrame((current) => current + 1);
    }, 100);

    return () => window.clearInterval(interval);
  }, [active]);

  return spinnerFrames[frame % spinnerFrames.length];
};

export const asciiBar = (passed: number, total: number, width: number) => {
  const filled = total > 0 ? Math.max(0, Math.min(width, Math.round((passed / total) * width))) : 0;

  return { fill: '▓'.repeat(filled), rest: '░'.repeat(width - filled) };
};
