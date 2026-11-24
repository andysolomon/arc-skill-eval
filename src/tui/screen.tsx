import { useEffect, useState, type ReactElement, type ReactNode } from 'react';
import { Box, useStdout } from 'ink';

export interface TerminalSize { cols: number; rows: number }

function readTerminalSize(stdout?: NodeJS.WriteStream): TerminalSize {
  return { cols: stdout?.columns ?? 120, rows: stdout?.rows ?? 40 };
}

/** The terminal's size, updated on every resize. */
export function useTerminalSize(): TerminalSize {
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

declare const madeByScreen: unique symbol;

/** A screen drawn in the terminal-sized frame. Only screen() makes one. */
export type Framed = ReactElement & { readonly [madeByScreen]: true };

/**
 * Draw `body` in a frame exactly the terminal's size. Ink clears the screen
 * before a frame only when the frame is at least as tall as the terminal, and
 * the terminal wraps any line wider than itself, so a frame of any other size
 * leaves stale or shifted lines. A shorter body is padded to the full height.
 * A taller one keeps its layout and is cut at the bottom edge rather than
 * squeezed, and tests/tui-screens-fit.test.mjs fails on any cut.
 */
export function screen(size: TerminalSize, body: ReactNode): Framed {
  return (
    <Box flexDirection="column" width={size.cols} height={size.rows} flexShrink={0} overflow="hidden">
      <Box flexDirection="column" flexGrow={1} flexShrink={0}>
        {body}
      </Box>
    </Box>
  ) as Framed;
}
