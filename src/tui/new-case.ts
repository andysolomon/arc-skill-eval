// Append a skeleton eval case to <skillDir>/evals/evals.json. The TUI offers
// just enough to remove the "hand-write JSON from scratch" friction — id,
// prompt, expected — then writes a placeholder assertion and points the user
// at $EDITOR for the detailed assertion authoring (matches arc-creating-evals).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';

export interface NewCaseInput {
  skillDir: string;
  id: string;
  prompt: string;
  expected: string;
}

export interface NewCaseResult {
  evalsPath: string;
  caseId: string;
  total: number;   // case count after append
}

/** Read evals.json, append a skeleton case, write it back (2-space, trailing \n). */
export async function appendEvalCase(input: NewCaseInput): Promise<NewCaseResult> {
  const evalsPath = path.join(input.skillDir, 'evals', 'evals.json');
  const raw = await fs.readFile(evalsPath, 'utf8');
  const doc = JSON.parse(raw) as { skill_name?: string; evals?: unknown[] };
  if (!Array.isArray(doc.evals)) doc.evals = [];

  const id = uniqueId(input.id.trim() || 'new-case', doc.evals);
  doc.evals.push({
    id,
    prompt: input.prompt.trim() || 'TODO: prompt',
    expected_output: input.expected.trim() || 'TODO: expected output',
    setup: { kind: 'empty' },
    // One placeholder assertion so the case is structurally valid and shows up
    // as failing-until-authored rather than silently empty. Uses the script
    // assertion form the loader validates ({ type, path }) — the loader rejects
    // any object without a `type`/`kind`, so a shorthand would fail validation.
    assertions: [
      { type: 'file-exists', path: 'TODO/path-the-skill-should-create' },
    ],
  });

  await fs.writeFile(evalsPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return { evalsPath, caseId: id, total: doc.evals.length };
}

function uniqueId(base: string, evals: unknown[]): string {
  const taken = new Set(evals.map((e) => (e && typeof e === 'object' ? String((e as { id?: unknown }).id) : '')));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
