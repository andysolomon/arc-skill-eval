import { Array, Option } from 'effect';

export const spinnerFrames: ReadonlyArray<string> = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const spinnerGlyph = (frame: number): string =>
  Option.getOrElse(Array.get(spinnerFrames, frame % spinnerFrames.length), () => '⠋');

/** A fixed-width text bar, `passed` of `total` filled. */
export const asciiBar = (passed: number, total: number, width: number): Readonly<{ fill: string; rest: string }> => {
  const filled = total > 0 ? Math.max(0, Math.min(width, Math.round((passed / total) * width))) : 0;
  return { fill: '▓'.repeat(filled), rest: '░'.repeat(width - filled) };
};
