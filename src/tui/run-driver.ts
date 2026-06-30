// In-process eval runner for the TUI. The browse command and the run command
// live in the SAME package, so we call runEvalsCommand directly instead of
// spawning `arc-skill-eval run` as a child and scraping stdout. Ink never
// unmounts; the alternate screen is never handed off.
//
// Per-case progress comes from an optional `onProgress` hook we add to
// runEvalsCommand (see SCAFFOLD-RUN-CONSOLE.md → "Repo patch"). When the
// installed version predates that hook, we degrade gracefully: emit a single
// "all cases queued" snapshot up front and the real verdicts once the promise
// resolves.

import { runEvalsCommand } from '../cli/run-evals-command.js';
import type { RunEvalsCommandResult } from '../cli/run-evals-command.js';
import { readEvalsJson } from '../evals/loader.js';
import * as path from 'node:path';

export type CasePhase = 'queued' | 'running' | 'pass' | 'fail';

export interface RunCaseState {
  id: string;
  phase: CasePhase;
  assertTotal: number;
  assertPass: number;
  message?: string;   // error text for a failed/errored case
}

export type RunEvent =
  | { type: 'init'; skill: string; compare: boolean; cases: RunCaseState[] }
  | { type: 'case-start'; id: string }
  | { type: 'case-progress'; id: string; assertPass: number }
  | { type: 'case-done'; id: string; phase: 'pass' | 'fail'; assertPass: number; assertTotal: number; message?: string }
  | { type: 'done'; passed: number; failed: number; durationMs: number; result: RunEvalsCommandResult }
  | { type: 'error'; message: string };

export interface RunRequest {
  skillDir: string;
  caseId: string | null;   // null = whole skill
  compare: boolean;
}

// Progress payload shape we expect the repo hook to emit (kept structural so a
// version mismatch never throws — we read fields defensively).
interface ProgressEvent {
  phase: 'case-start' | 'assertion' | 'case-done';
  caseId: string;
  assertionsPassed?: number;
  assertionsTotal?: number;
  passed?: boolean;
  message?: string;
}

/**
 * Drive a run, emitting events as it progresses. Returns the underlying
 * promise so the caller can `await` completion (and a `cancel` is exposed via
 * AbortSignal once the repo run loop honors one — see the patch doc).
 */
export async function runInProcess(req: RunRequest, emit: (ev: RunEvent) => void): Promise<void> {
  const skillName = path.basename(req.skillDir);

  // Seed the case list from evals.json so the overlay paints immediately,
  // even before the first model call returns.
  let seeded: RunCaseState[] = [];
  try {
    const evals = await readEvalsJson(path.join(req.skillDir, 'evals', 'evals.json'));
    seeded = evals.evals
      .filter((c) => !req.caseId || String(c.id) === req.caseId)
      .map((c) => ({ id: String(c.id), phase: 'queued' as const, assertTotal: (c.assertions ?? []).length, assertPass: 0 }));
  } catch {
    if (req.caseId) seeded = [{ id: req.caseId, phase: 'queued', assertTotal: 0, assertPass: 0 }];
  }
  emit({ type: 'init', skill: skillName, compare: req.compare, cases: seeded });

  const started = Date.now();
  try {
    const result = await runEvalsCommand({
      input: req.skillDir,
      caseIds: req.caseId ? [req.caseId] : [],
      compare: req.compare,
      // The hook is optional in the type (added by the patch). Cast keeps this
      // file compiling against either version of the command options.
      ...( { onProgress: (ev: ProgressEvent) => {
        if (ev.phase === 'case-start') emit({ type: 'case-start', id: ev.caseId });
        else if (ev.phase === 'assertion') emit({ type: 'case-progress', id: ev.caseId, assertPass: ev.assertionsPassed ?? 0 });
        else if (ev.phase === 'case-done') emit({ type: 'case-done', id: ev.caseId, phase: ev.passed ? 'pass' : 'fail', assertPass: ev.assertionsPassed ?? 0, assertTotal: ev.assertionsTotal ?? 0, message: ev.message });
      } } as Record<string, unknown> ),
    } as Parameters<typeof runEvalsCommand>[0]);

    // Backfill verdicts for any case the hook didn't report (older versions).
    for (const skill of result.skills) {
      for (const c of skill.cases) {
        const g = c.grading.summary;
        emit({ type: 'case-done', id: String(c.caseId), phase: g.failed === 0 && g.total > 0 ? 'pass' : 'fail', assertPass: g.passed, assertTotal: g.total });
      }
      for (const err of skill.errors) {
        emit({ type: 'case-done', id: String(err.caseId), phase: 'fail', assertPass: 0, assertTotal: 0, message: err.message });
      }
    }

    emit({ type: 'done', passed: result.summary.passedCases, failed: result.summary.failedCases, durationMs: Date.now() - started, result });
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
