import { createElement } from 'react';
import { render } from 'ink';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import * as os from 'node:os';
import * as path from 'node:path';
import { App } from '../tui/app.js';
import type { AppAction, AppState } from '../tui/app.js';
import { loadWorkspace, reloadSkill } from '../tui/load-artifacts.js';
import { renderStream } from '../tui/caps.js';
import type { Workspace } from '../tui/types.js';

const ALT_ENTER = '\x1b[?1049h';
const ALT_EXIT = '\x1b[?1049l';

export interface BrowseOptions {
  input?: string;
  showWithout?: boolean;
}

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
      try { mergeSkill(ws, skillDir, await reloadSkill(skillDir)); } catch {}
      if (!done && instance) instance.rerender(element());
    }
    instance = render(element(), { exitOnCtrlC: true, stdout: renderStream(process.stdout) });
    // Ctrl-C path: Ink resolves waitUntilExit on its own.
    instance.waitUntilExit().then(() => { if (!done) { done = true; resolve({ type: 'quit' }); } });
  });
}

function mergeSkill(ws: Workspace, skillDir: string, reloaded: Awaited<ReturnType<typeof reloadSkill>>): void {
  if (!reloaded.skill) return;
  const dir = path.resolve(skillDir);
  const i = ws.skills.findIndex((s) => s.dir === dir);
  if (i >= 0) ws.skills[i] = reloaded.skill; else ws.skills.push(reloaded.skill);
  const base = path.basename(dir);
  ws.runs = ws.runs.filter((r) => r.skill !== base && r.skill !== reloaded.skill!.id).concat(reloaded.runs);
}

function stateFile(input: string): string {
  const hash = createHash('sha1').update(path.resolve(input)).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `arc-skill-eval-tui-${hash}.json`);
}
async function readState(input: string): Promise<AppState | undefined> {
  try { return JSON.parse(await fs.readFile(stateFile(input), 'utf8')) as AppState; } catch { return undefined; }
}
async function writeState(input: string, state: AppState): Promise<void> {
  try { await fs.writeFile(stateFile(input), JSON.stringify(state), 'utf8'); } catch {}
}

export async function browseCommand(opts: BrowseOptions = {}): Promise<number> {
  const input = opts.input ?? '.';
  const showWithout = opts.showWithout ?? true;

  process.stdout.write(ALT_ENTER);
  const cleanup = () => process.stdout.write(ALT_EXIT);
  process.on('exit', cleanup);

  try {
    const ws = await loadWorkspace(input);
    const action = await runApp(ws, await readState(input), showWithout);
    if (action.state) await writeState(input, action.state);
  } finally {
    cleanup();
    process.off('exit', cleanup);
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  browseCommand({ input: process.argv[2] }).then((code) => process.exit(code));
}
