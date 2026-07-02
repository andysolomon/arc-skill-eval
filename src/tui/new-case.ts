// Append an eval case to <skillDir>/evals/evals.json. The TUI collects id,
// prompt, expected output, and (since W-000031) real assertions — script
// assertions (file-exists / regex-match / json-valid) and LLM-judged string
// assertions — following the script-first methodology in
// skills/arc-creating-evals (Phase 4: 2–5 assertions per case).
// When the author adds no assertions, a placeholder is written so the case
// is structurally valid and shows up as failing-until-authored.

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { validateEvalsJsonValue } from '../evals/loader.js';

/**
 * The assertion shapes the TUI can author. `judge` maps to a plain string
 * assertion in evals.json (LLM-judged); the rest map to script assertions.
 */
export type AuthoredAssertion =
  | { type: 'file-exists'; path: string }
  | { type: 'regex-match'; pattern: string; flags?: string; target: 'assistant-text' | { file: string } }
  | { type: 'json-valid'; path: string }
  | { type: 'judge'; text: string };

export const ASSERTION_BUDGET = { min: 2, max: 5 } as const;

/**
 * Validate a single authored assertion for inline form feedback.
 * Returns a human-readable problem, or null when the assertion is usable.
 */
export function validateAuthoredAssertion(assertion: AuthoredAssertion): string | null {
  switch (assertion.type) {
    case 'file-exists':
    case 'json-valid':
      if (!assertion.path.trim()) return 'path is required';
      return null;
    case 'regex-match': {
      if (!assertion.pattern.trim()) return 'pattern is required';
      try {
        // Validates both pattern and flags in one construction.
        void new RegExp(assertion.pattern, assertion.flags || undefined);
      } catch (err) {
        return `invalid regex: ${err instanceof Error ? err.message : String(err)}`;
      }
      if (typeof assertion.target === 'object' && !assertion.target.file.trim()) {
        return 'target file is required (or leave empty for assistant-text)';
      }
      return null;
    }
    case 'judge':
      if (!assertion.text.trim()) return 'assertion text is required';
      return null;
  }
}

/** Map an authored assertion to the evals.json shape the loader accepts. */
export function toEvalsJsonAssertion(assertion: AuthoredAssertion): unknown {
  switch (assertion.type) {
    case 'file-exists':
      return { type: 'file-exists', path: assertion.path.trim() };
    case 'json-valid':
      return { type: 'json-valid', path: assertion.path.trim() };
    case 'regex-match':
      return {
        type: 'regex-match',
        pattern: assertion.pattern,
        ...(assertion.flags?.trim() ? { flags: assertion.flags.trim() } : {}),
        ...(assertion.target === 'assistant-text'
          ? { target: 'assistant-text' }
          : { target: { file: assertion.target.file.trim() } }),
      };
    case 'judge':
      return assertion.text.trim();
  }
}

export interface NewCaseInput {
  skillDir: string;
  id: string;
  prompt: string;
  expected: string;
  /** Authored assertions; empty/absent falls back to the placeholder. */
  assertions?: AuthoredAssertion[];
}

export interface NewCaseResult {
  evalsPath: string;
  caseId: string;
  total: number;            // case count after append
  assertionCount: number;   // authored assertions written (0 = placeholder)
}

/** Read evals.json, append a case, validate the result, write it back (2-space, trailing \n). */
export async function appendEvalCase(input: NewCaseInput): Promise<NewCaseResult> {
  const evalsPath = path.join(input.skillDir, 'evals', 'evals.json');
  const raw = await fs.readFile(evalsPath, 'utf8');
  const doc = JSON.parse(raw) as { skill_name?: string; evals?: unknown[] };
  if (!Array.isArray(doc.evals)) doc.evals = [];

  const authored = input.assertions ?? [];
  for (const assertion of authored) {
    const problem = validateAuthoredAssertion(assertion);
    if (problem) throw new Error(`invalid ${assertion.type} assertion: ${problem}`);
  }

  const id = uniqueId(input.id.trim() || 'new-case', doc.evals);
  doc.evals.push({
    id,
    prompt: input.prompt.trim() || 'TODO: prompt',
    expected_output: input.expected.trim() || 'TODO: expected output',
    setup: { kind: 'empty' },
    assertions: authored.length > 0
      ? authored.map(toEvalsJsonAssertion)
      : [
          // Placeholder so an assertion-less case is structurally valid and
          // shows up as failing-until-authored rather than silently empty.
          { type: 'file-exists', path: 'TODO/path-the-skill-should-create' },
        ],
  });

  // The exact validation the loader applies at run time — an entry the
  // runner would reject is never written to disk.
  validateEvalsJsonValue(doc, `evals.json (new case "${id}")`);

  await fs.writeFile(evalsPath, JSON.stringify(doc, null, 2) + '\n', 'utf8');
  return { evalsPath, caseId: id, total: doc.evals.length, assertionCount: authored.length };
}

function uniqueId(base: string, evals: unknown[]): string {
  const taken = new Set(evals.map((e) => (e && typeof e === 'object' ? String((e as { id?: unknown }).id) : '')));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}
