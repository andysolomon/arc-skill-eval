// `arc-skill-eval browse [skill-dir-or-repo]` — interactive run browser.
// Wire this into your CLI dispatcher (see arc-skill-eval-tui/README.md).

import React from 'react';
import { render } from 'ink';
import { App } from '../tui/app.js';
import { loadWorkspace } from '../tui/load-artifacts.js';

const ALT_ENTER = '\x1b[?1049h';
const ALT_EXIT = '\x1b[?1049l';

export interface BrowseOptions {
  input?: string;
}

export async function browseCommand(opts: BrowseOptions = {}): Promise<number> {
  const input = opts.input ?? '.';
  const workspace = await loadWorkspace(input);

  // Use the terminal alternate screen so the TUI doesn't scroll the scrollback.
  process.stdout.write(ALT_ENTER);
  const cleanup = () => process.stdout.write(ALT_EXIT);
  process.on('exit', cleanup);

  const instance = render(React.createElement(App, { skills: workspace.skills, runs: workspace.runs }), {
    exitOnCtrlC: true,
  });

  try {
    await instance.waitUntilExit();
  } finally {
    cleanup();
    process.off('exit', cleanup);
  }
  return 0;
}

// Allow `node dist/cli/browse-command.js <dir>` directly during development.
if (import.meta.url === `file://${process.argv[1]}`) {
  browseCommand({ input: process.argv[2] }).then((code) => process.exit(code));
}
