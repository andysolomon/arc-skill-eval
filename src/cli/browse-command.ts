// `arc-skill-eval browse [skill-dir-or-repo]` — interactive run browser.
// Wire this into your CLI dispatcher (see arc-skill-eval-tui/README.md).
//
// Control flow: `r`/`R`, `o` (supported custom run flags), and new-case (`n`)
// run IN-PROCESS inside the App (it calls runEvalsCommand directly and reloads
// via the `onReload` callback below) — Ink never unmounts for normal browse
// workflows. The older child-process `rerun` action remains as a fallback for
// callers that explicitly hand one back to the controller.

import { createElement } from 'react';
import { render } from 'ink';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from '../tui/app.js';
import type { AppAction, AppState } from '../tui/app.js';
import { loadWorkspace, reloadSkill } from '../tui/load-artifacts.js';
import type { Workspace } from '../tui/types.js';

const ALT_ENTER = '\x1b[?1049h';
const ALT_EXIT = '\x1b[?1049l';
const CLEAR = '\x1b[2J\x1b[H';

// `arc-skill-eval` must be on PATH (npm link / global install). Override for dev.
const BIN = process.env.ARC_SKILL_EVAL_BIN ?? 'arc-skill-eval';

export interface BrowseOptions {
  input?: string;
  showWithout?: boolean;
}

/** Render the App and resolve once the user quits or requests a re-run.
 *  `onReload` lets the App reload a skill in place after an in-process run or a
 *  new-case write — it patches the shared workspace and re-renders without
 *  unmounting, so Ink keeps the screen the whole time. */
function runApp(ws: Workspace, initial: AppState | undefined, showWithout: boolean): Promise<AppAction> {
  return new Promise((resolve) => {
    let done = false;
    let instance: ReturnType<typeof render>;
    const element = () =>
      createElement(App, { skills: ws.skills, runs: ws.runs, onAction: finish, onReload, initial, showWithout });
    function finish(a: AppAction): void {
      if (done) return;
      done = true;
      instance.unmount();
      resolve(a);
    }
    async function onReload(skillDir: string): Promise<void> {
      try { mergeSkill(ws, skillDir, await reloadSkill(skillDir)); } catch { /* keep the stale view */ }
      if (!done && instance) instance.rerender(element());
    }
    instance = render(element(), { exitOnCtrlC: true });
    // Ctrl-C path: Ink resolves waitUntilExit on its own.
    instance.waitUntilExit().then(() => { if (!done) { done = true; resolve({ type: 'quit' }); } });
  });
}

/** Run `arc-skill-eval run <skillDir> [--case <id>] [extra flags]` with inherited stdio. */
function runChild(skillDir: string, caseId: string | null, compare?: boolean, extraArgs?: string): Promise<void> {
  return new Promise((resolve) => {
    const args = ['run', skillDir];
    if (caseId) args.push('--case', caseId);
    if (compare) args.push('--compare');
    // user-typed flags from the `o` prompt (e.g. "--model anthropic/claude --iteration v2")
    if (extraArgs) for (const tok of extraArgs.split(/\s+/).filter(Boolean)) args.push(tok);
    process.stdout.write(`\n$ ${BIN} ${args.join(' ')}\n\n`);
    const child = spawn(BIN, args, { stdio: 'inherit' });
    child.on('exit', () => resolve());
    child.on('error', (err) => {
      process.stdout.write(`\nCould not launch "${BIN}": ${err.message}\n`);
      process.stdout.write('Set ARC_SKILL_EVAL_BIN or `npm link` the package first.\n');
      resolve();
    });
  });
}

/** Wait for a single keypress ("press any key to return"). */
function waitForKey(): Promise<void> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    // TTY stdin does not always keep Node's event loop alive by itself. Keep a
    // tiny handle open so the top-level CLI await cannot be reported as
    // "unsettled" while the TUI is waiting at the post-rerun prompt.
    const keepAlive = setInterval(() => { /* keep process alive until keypress */ }, 60_000);
    const finish = () => {
      clearInterval(keepAlive);
      stdin.removeListener('data', finish);
      if (stdin.isTTY) stdin.setRawMode(Boolean(wasRaw));
      stdin.pause();
      resolve();
    };
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.once('data', finish);
  });
}

/** Splice a freshly-reloaded skill (and its runs) into the in-memory workspace. */
function mergeSkill(ws: Workspace, skillDir: string, reloaded: Awaited<ReturnType<typeof reloadSkill>>): void {
  if (!reloaded.skill) return;
  const dir = path.resolve(skillDir);
  const i = ws.skills.findIndex((s) => s.dir === dir);
  if (i >= 0) ws.skills[i] = reloaded.skill; else ws.skills.push(reloaded.skill);
  const base = path.basename(dir);
  // drop this skill's old runs (matched by name/basename) and append the fresh ones
  ws.runs = ws.runs.filter((r) => r.skill !== base && r.skill !== reloaded.skill!.id).concat(reloaded.runs);
}

// Persist the last view per input path (so quitting + reopening lands where you left off).
function stateFile(input: string): string {
  const hash = createHash('sha1').update(path.resolve(input)).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `arc-skill-eval-tui-${hash}.json`);
}
async function readState(input: string): Promise<AppState | undefined> {
  try { return JSON.parse(await fs.readFile(stateFile(input), 'utf8')) as AppState; } catch { return undefined; }
}
async function writeState(input: string, state: AppState): Promise<void> {
  try { await fs.writeFile(stateFile(input), JSON.stringify(state), 'utf8'); } catch { /* ignore */ }
}

export async function browseCommand(opts: BrowseOptions = {}): Promise<number> {
  const input = opts.input ?? '.';
  const showWithout = opts.showWithout ?? true;

  process.stdout.write(ALT_ENTER);
  const cleanup = () => process.stdout.write(ALT_EXIT);
  process.on('exit', cleanup);

  try {
    const ws = await loadWorkspace(input); // loaded once; re-runs patch it in place
    let initial: AppState | undefined = await readState(input);
    for (;;) {
      const action = await runApp(ws, initial, showWithout);
      if (action.type === 'quit') {
        if (action.state) await writeState(input, action.state);
        break;
      }
      if (action.type === 'rerun') {
        initial = action.state; // remember where the user was
        process.stdout.write(ALT_EXIT); // hand the normal screen to the child
        await runChild(action.skillDir, action.caseId, action.compare, action.extraArgs);
        mergeSkill(ws, action.skillDir, await reloadSkill(action.skillDir));
        process.stdout.write('\nReloaded — press any key…');
        await waitForKey();
        process.stdout.write(ALT_ENTER + CLEAR);
      }
    }
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
