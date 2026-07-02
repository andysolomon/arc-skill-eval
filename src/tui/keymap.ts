// Canonical keymap — the SINGLE source of truth for browse keybindings.
// The in-TUI help overlay (`?`) and the docs page both render from this, so a
// key can never be documented in one place and missing in the other.
//
// When you add or change a binding:
//   1. edit the table here,
//   2. handle the key in app.tsx (the `id` is a stable handle, not the key),
//   3. run `node scripts/gen-keymap-docs.mjs` to regenerate the docs page.
// The conformance test asserts every `id` used in app.tsx exists here.

export interface KeyBinding {
  id: string;            // stable identifier referenced by app.tsx + tests
  keys: string[];        // display labels, e.g. ['↑', '↓', 'j', 'k']
  desc: string;
  context?: string;      // panel/mode this applies to (omit = global)
}

export interface KeySection {
  title: string;
  bindings: KeyBinding[];
}

export const KEYMAP: KeySection[] = [
  {
    title: 'Navigation',
    bindings: [
      { id: 'move',        keys: ['↑', '↓', 'j', 'k'], desc: 'Move the selection in the focused panel' },
      { id: 'panel-cycle', keys: ['tab', '⇧tab'],      desc: 'Focus the next / previous panel' },
      { id: 'panel-jump',  keys: ['1', '–', '4'],       desc: 'Jump to Skills / Cases / Assertions / Runs' },
      { id: 'edge',        keys: ['g', 'G'],            desc: 'Jump to top / bottom of the list' },
      { id: 'quit',        keys: ['q', 'ctrl-c'],       desc: 'Quit' },
    ],
  },
  {
    title: 'Detail pane',
    bindings: [
      { id: 'pane-enter',  keys: ['→', 'l', '↵'],       desc: 'Drop a cursor into the detail pane (scroll follows it)' },
      { id: 'pane-drill',  keys: ['↵'],                 desc: 'Drill the cursor item into its side panel', context: 'in pane' },
      { id: 'pane-leave',  keys: ['←', 'h', 'esc'],     desc: 'Leave the detail-pane cursor' },
      { id: 'pane-scroll', keys: ['PgUp', 'PgDn', '⌃u', '⌃d'], desc: 'Scroll the detail pane' },
      { id: 'case-mode',   keys: ['[', ']'],            desc: 'Cycle case mode: Overview · Response · Diff · Trace · Context · Raw', context: 'Cases' },
      { id: 'raw',         keys: ['v'],                 desc: 'Jump to raw grading.json', context: 'Cases' },
    ],
  },
  {
    title: 'Run & author',
    bindings: [
      { id: 'run',         keys: ['r'],                 desc: 'Run evals for the selection in-TUI (live spinner, Ink stays mounted)' },
      { id: 'run-compare', keys: ['R'],                 desc: 'Run with --compare (with_skill vs without_skill)' },
      { id: 'run-opts',    keys: ['o'],                 desc: 'Run with custom flags (--model, --iteration, --extra-skill…)' },
      { id: 'new-case',    keys: ['n'],                 desc: 'Author a new eval case (id, prompt, typed assertions) → evals.json', context: 'Skills/Cases' },
      { id: 'create-suite', keys: ['C'],                desc: 'Guided create: propose, review & write an eval suite for the skill', context: 'Skills' },
      { id: 'feedback',    keys: ['f'],                 desc: 'Write a feedback.json note for the case (feeds improve)', context: 'Cases' },
      { id: 'run-abort',   keys: ['esc'],               desc: 'Abort an in-flight run', context: 'running' },
      { id: 'run-reload',  keys: ['↵'],                 desc: 'Reload artifacts & close the run console', context: 'run complete' },
    ],
  },
  {
    title: 'Filter & compare',
    bindings: [
      { id: 'filter',      keys: ['/'],                 desc: 'Filter skills + cases (type, ↵ apply, esc clear)' },
      { id: 'failures',    keys: ['F'],                 desc: 'Toggle failures-only' },
      { id: 'sort',        keys: ['s'],                 desc: 'Cycle skill sort: name · pass · delta · cost' },
      { id: 'pin-base',    keys: ['c'],                 desc: 'Pin a run as the cross-iteration baseline', context: 'Runs' },
      { id: 'help',        keys: ['?'],                 desc: 'Toggle this help overlay' },
    ],
  },
];

/** Flat set of every binding id — used by the conformance test in app.tsx. */
export const KEY_IDS: ReadonlySet<string> = new Set(KEYMAP.flatMap((s) => s.bindings.map((b) => b.id)));

/** Render the keymap as Markdown (for the docs page generator). */
export function keymapToMarkdown(): string {
  const out: string[] = [];
  for (const section of KEYMAP) {
    out.push(`### ${section.title}\n`);
    out.push('| Key | Action |', '| --- | --- |');
    for (const b of section.bindings) {
      const keys = b.keys.join(' ');
      const ctx = b.context ? ` _(${b.context})_` : '';
      out.push(`| \`${keys}\` | ${b.desc}${ctx} |`);
    }
    out.push('');
  }
  return out.join('\n');
}
