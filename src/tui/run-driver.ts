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
import type { RunEvalsCommandOptions, RunEvalsCommandResult } from '../cli/run-evals-command.js';
import { readEvalsJson } from '../evals/loader.js';
import type { EvalContextMode } from '../observability/types.js';
import { THINKING_LEVEL_VALUES, type ModelSelection, type ThinkingLevel } from '../contracts/types.js';
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
  | { type: 'init'; skill: string; compare: boolean; extraArgs?: string; cases: RunCaseState[] }
  | { type: 'case-start'; id: string }
  | { type: 'case-progress'; id: string; assertPass: number }
  | { type: 'case-done'; id: string; phase: 'pass' | 'fail'; assertPass: number; assertTotal: number; message?: string }
  | { type: 'done'; passed: number; failed: number; durationMs: number; result: RunEvalsCommandResult }
  | { type: 'error'; message: string };

export interface RunRequest {
  skillDir: string;
  caseId: string | null;   // null = whole skill
  compare: boolean;
  extraArgs?: string;
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

const THINKING_LEVELS = new Set<ThinkingLevel>(THINKING_LEVEL_VALUES);

function parseModel(raw: string, flag: string): ModelSelection {
  const slash = raw.indexOf('/');
  if (slash <= 0 || slash === raw.length - 1) throw new Error(`Invalid ${flag}: ${raw}. Expected provider/model or provider/model:thinking.`);
  const provider = raw.slice(0, slash);
  const modelAndMaybeThinking = raw.slice(slash + 1);
  const colon = modelAndMaybeThinking.lastIndexOf(':');
  if (colon < 0) return { provider, id: modelAndMaybeThinking };
  const suffix = modelAndMaybeThinking.slice(colon + 1);
  if (!THINKING_LEVELS.has(suffix as ThinkingLevel)) return { provider, id: modelAndMaybeThinking };
  const id = modelAndMaybeThinking.slice(0, colon);
  if (!id) throw new Error(`Invalid ${flag}: ${raw}. Expected provider/model or provider/model:thinking.`);
  return { provider, id, thinking: suffix as ThinkingLevel };
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
    else if (flag === '--compare') opts.compare = true;
    else if (flag) throw new Error(`Unsupported in-TUI run flag: ${flag}`);
  }
  return opts;
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
  emit({ type: 'init', skill: skillName, compare: req.compare, extraArgs: req.extraArgs, cases: seeded });

  const started = Date.now();
  try {
    const result = await runEvalsCommand({
      input: req.skillDir,
      caseIds: req.caseId ? [req.caseId] : [],
      compare: req.compare,
      ...parseExtraRunArgs(req.extraArgs),
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

    if (result.summary.totalCases === 0) {
      // Discovery matched nothing (bad skill dir, stale --case id). Without
      // this, the console reports "run complete, 0 passed" while the seeded
      // rows sit queued forever — surface it as the failure it is.
      emit({ type: 'error', message: `Run finished without executing any case${req.caseId ? ` (--case ${req.caseId})` : ''} — check the skill dir and case id.` });
      return;
    }

    emit({ type: 'done', passed: result.summary.passedCases, failed: result.summary.failedCases, durationMs: Date.now() - started, result });
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
}
