// In-process eval runner for the TUI. The browse command and the run command
// live in the same package, so we call runEvalsCommand directly instead of
// spawning `arc-skill-eval run` as a child and scraping stdout. Ink never
// unmounts; the alternate screen is never handed off.
//
// Per-case progress comes from runEvalsCommand's `onProgress` hook. The
// caller's AbortSignal goes to the run, so closing the console stops the
// in-flight case instead of leaving it to spend tokens in the background.

import { runEvalsCommand } from '../cli/run-evals-command.js';
import type { RunEvalsCommandOptions, RunEvalsCommandResult } from '../cli/run-evals-command.js';
import { readEvalsJson } from '../evals/loader.js';
import { EvalRunCancelledError } from '../evals/eval-run/types.js';
import type { EvalContextMode } from '../observability/types.js';
import { parseModelSelection } from '../contracts/model-selection.js';
import type { ModelSelection } from '../contracts/types.js';
import * as path from 'node:path';

export type CasePhase = 'queued' | 'running' | 'pass' | 'fail';

export interface RunCaseState {
  id: string;
  phase: CasePhase;
  assertTotal: number;
  assertPass: number;
  message?: string;   // error text for a failed/errored case
  errored?: boolean;  // case never produced a verdict — it errored before assertions ran
}

export type RunEvent =
  | { type: 'init'; skill: string; compare: boolean; extraArgs?: string; cases: RunCaseState[] }
  | { type: 'case-start'; id: string }
  | { type: 'case-progress'; id: string; assertPass: number }
  | { type: 'case-done'; id: string; phase: 'pass' | 'fail'; assertPass: number; assertTotal: number; message?: string; errored?: boolean }
  | { type: 'done'; passed: number; failed: number; durationMs: number; result: RunEvalsCommandResult }
  | { type: 'error'; message: string }
  | { type: 'cancelled' };

export interface RunRequest {
  skillDir: string;
  caseId: string | null;   // null = whole skill
  compare: boolean;
  extraArgs?: string;
}

/**
 * Build a case-done event. An errored case is exactly one that carries an
 * error message with no assertions run (assertTotal 0), which is how the
 * onProgress hook reports a case that threw. The flag is decided here, at
 * emit time, so the console reducer stays simple.
 */
export function makeCaseDone(fields: { id: string; phase: 'pass' | 'fail'; assertPass: number; assertTotal: number; message?: string }): RunEvent {
  const errored = fields.message != null && fields.assertTotal === 0;
  return errored ? { type: 'case-done', ...fields, errored: true } : { type: 'case-done', ...fields };
}

function parseModel(raw: string, flag: string): ModelSelection {
  const parsed = parseModelSelection(raw, flag);
  if (!parsed.ok) throw new Error(parsed.message);
  return parsed.selection;
}

// Same rule as the run CLI's --case-timeout: positive seconds, stored as ms.
function parseCaseTimeout(raw: string): number {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid --case-timeout: ${raw}. Expected a positive number of seconds.`);
  return Math.round(seconds * 1000);
}

function splitArgs(raw = ''): string[] {
  const out: string[] = [];
  let cur = '';
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      else cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (quote) throw new Error('Unclosed quote in run flags.');
  if (cur) out.push(cur);
  return out;
}

function parseExtraRunArgs(raw?: string): Partial<RunEvalsCommandOptions> {
  const args = splitArgs(raw);
  const opts: Partial<RunEvalsCommandOptions> = {};
  const take = (i: number, flag: string): string => {
    const v = args[i + 1];
    if (!v || v.startsWith('--')) throw new Error(`Missing value for ${flag}.`);
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const eq = arg.indexOf('=');
    const flag = eq >= 0 ? arg.slice(0, eq) : arg;
    const inline = eq >= 0 ? arg.slice(eq + 1) : undefined;
    const value = inline ?? (flag.startsWith('--') && flag !== '--compare' ? take(i, flag) : undefined);
    if (inline == null && flag.startsWith('--') && flag !== '--compare') i++;
    if (flag === '--model') opts.model = parseModel(value!, flag);
    else if (flag === '--judge-model') opts.judgeModel = parseModel(value!, flag);
    else if (flag === '--iteration') opts.iteration = value;
    else if (flag === '--agent-dir') opts.agentDir = value;
    else if (flag === '--context-mode') opts.contextMode = value as EvalContextMode;
    else if (flag === '--extra-skill') opts.extraSkillPaths = [...(opts.extraSkillPaths ?? []), value!];
    else if (flag === '--case-timeout') opts.caseTimeoutMs = parseCaseTimeout(value!);
    else if (flag === '--compare') opts.compare = true;
    else if (flag) throw new Error(`Unsupported in-TUI run flag: ${flag}`);
  }
  return opts;
}

/**
 * Drive a run, emitting events as it progresses. Resolves once the run
 * settles and never rejects. Aborting `signal` stops the in-flight case; the
 * run then ends with a `cancelled` event instead of `done` or `error`.
 */
export async function runInProcess(req: RunRequest, emit: (ev: RunEvent) => void, signal?: AbortSignal): Promise<void> {
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
  emit({ type: 'init', skill: skillName, compare: req.compare, extraArgs: req.extraArgs, cases: seeded });

  const started = Date.now();
  try {
    const result = await runEvalsCommand({
      input: req.skillDir,
      caseIds: req.caseId ? [req.caseId] : [],
      compare: req.compare,
      ...parseExtraRunArgs(req.extraArgs),
      signal,
      onProgress: (ev) => {
        if (ev.phase === 'case-start') emit({ type: 'case-start', id: ev.caseId });
        else if (ev.phase === 'assertion') emit({ type: 'case-progress', id: ev.caseId, assertPass: ev.assertionsPassed ?? 0 });
        else if (ev.phase === 'case-done') emit(makeCaseDone({ id: ev.caseId, phase: ev.passed ? 'pass' : 'fail', assertPass: ev.assertionsPassed ?? 0, assertTotal: ev.assertionsTotal ?? 0, message: ev.message }));
      },
    });

    if (result.summary.totalCases === 0) {
      // Discovery matched nothing (bad skill dir, stale --case id). Without
      // this, the console reports "run complete, 0 passed" while the seeded
      // rows sit queued forever — surface it as the failure it is.
      emit({ type: 'error', message: `Run finished without executing any case${req.caseId ? ` (--case ${req.caseId})` : ''} — check the skill dir and case id.` });
      return;
    }

    emit({ type: 'done', passed: result.summary.passedCases, failed: result.summary.failedCases, durationMs: Date.now() - started, result });
  } catch (error) {
    if (error instanceof EvalRunCancelledError || signal?.aborted) { emit({ type: 'cancelled' }); return; }
    emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
